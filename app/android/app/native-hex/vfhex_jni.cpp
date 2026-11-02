// vfhex_jni - Salty Hexagon spike bridge (NOT the qualified F08 bridge).
//
// Implements the com.veridity.flow.mind.Lrt JNI facade over the current
// llama.cpp C API with the ggml Hexagon backend (HTP v75 on SM8650), so the
// existing RewindCapiEngine / LiteRtMindService stack can run Salty's GGUF
// on the NPU in the .meta lane only (gated by -PvfMetaHex / VF_META_HEX).
//
// Semantics matched to what RewindCapiEngine provably calls:
//  - generateStream: fused prefill(suffix) + decode, ChunkSink per piece,
//    terminal chunk error strings: null=eos, "Max number..."=cap,
//    "CANCELLED..."=cancel, "...kv-cache..."=overflow.
//  - checkpoints: llama seq-state bytes + token history, per label.
//  - exactCacheTokens: the session's token history ids.
// Media/conversation and debug natives fail closed (text-only spike).
#include <jni.h>
#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <dlfcn.h>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "llama.h"
#include "ggml-backend.h"

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "VFHex", __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, "VFHex", __VA_ARGS__)

namespace {

struct Checkpoint {
  std::vector<llama_token> tokens;
  std::vector<unsigned char> state;
};

struct Session {
  llama_context * ctx = nullptr;
  llama_sampler * sampler = nullptr;
  const llama_vocab * vocab = nullptr;
  int max_output = 512;
  std::vector<llama_token> history;
  std::map<std::string, Checkpoint> checkpoints;
  std::atomic<bool> cancel{false};
  long active_generation = -1;
  // benchmark receipts (last generateStream call)
  int consumed_prefill = 0;
  int consumed_decode = 0;
  std::vector<std::pair<int, double>> bench_prefill;
  std::vector<std::pair<int, double>> bench_decode;
};

struct Engine {
  llama_model * model = nullptr;
  const llama_vocab * vocab = nullptr;
  bool hex = false;
  int n_ctx = 4096;
};

std::mutex g_mu;
std::map<long, Engine *> g_engines;
std::map<long, Session *> g_sessions;
long g_next = 1;

double now_s() {
  using namespace std::chrono;
  return duration<double>(steady_clock::now().time_since_epoch()).count();
}

std::string bytes_of(JNIEnv * env, jbyteArray arr) {
  if (!arr) return "";
  jsize n = env->GetArrayLength(arr);
  std::string s((size_t) n, '\0');
  if (n) env->GetByteArrayRegion(arr, 0, n, reinterpret_cast<jbyte *>(&s[0]));
  return s;
}

std::vector<llama_token> tokenize(const llama_vocab * vocab, const std::string & text,
                                  bool add_bos, bool special) {
  int n = llama_tokenize(vocab, text.c_str(), (int) text.size(), nullptr, 0, add_bos, special);
  std::vector<llama_token> out((size_t) (n < 0 ? -n : n));
  if (out.empty()) return out;
  llama_tokenize(vocab, text.c_str(), (int) text.size(), out.data(), (int) out.size(), add_bos, special);
  return out;
}

std::string piece_of(const llama_vocab * vocab, llama_token tok) {
  char buf[256];
  int n = llama_token_to_piece(vocab, tok, buf, sizeof(buf), 0, true);
  if (n < 0) {
    std::string big((size_t) -n, '\0');
    n = llama_token_to_piece(vocab, tok, &big[0], (int) big.size(), 0, true);
    return big.substr(0, (size_t) (n > 0 ? n : 0));
  }
  return std::string(buf, (size_t) n);
}

// Decode tokens into the session KV in batches; history is appended by caller.
bool decode_tokens(Session * s, const llama_token * toks, int n, bool want_logits_last) {
  const int batch_cap = 512;
  for (int i = 0; i < n; i += batch_cap) {
    int chunk = n - i < batch_cap ? n - i : batch_cap;
    llama_batch batch = llama_batch_get_one(const_cast<llama_token *>(toks + i), chunk);
    if (llama_decode(s->ctx, batch) != 0) return false;
  }
  (void) want_logits_last;
  return true;
}

llama_sampler * make_sampler(int type, int top_k, float top_p, float temp, int seed) {
  llama_sampler_chain_params p = llama_sampler_chain_default_params();
  llama_sampler * smpl = llama_sampler_chain_init(p);
  if (type == 3) {  // SAMPLER_GREEDY
    llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
    return smpl;
  }
  if (top_k > 0) llama_sampler_chain_add(smpl, llama_sampler_init_top_k(top_k));
  if (top_p > 0.0f && top_p < 1.0f) llama_sampler_chain_add(smpl, llama_sampler_init_top_p(top_p, 1));
  if (temp > 0.0f) llama_sampler_chain_add(smpl, llama_sampler_init_temp(temp));
  llama_sampler_chain_add(smpl, llama_sampler_init_dist((uint32_t) seed));
  return smpl;
}

Session * session_of(jlong h) {
  std::lock_guard<std::mutex> lk(g_mu);
  auto it = g_sessions.find((long) h);
  return it == g_sessions.end() ? nullptr : it->second;
}
Engine * engine_of(jlong h) {
  std::lock_guard<std::mutex> lk(g_mu);
  auto it = g_engines.find((long) h);
  return it == g_engines.end() ? nullptr : it->second;
}

}  // namespace

extern "C" {

// ── lifecycle ─────────────────────────────────────────────────────────────
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_setLogLevel(JNIEnv *, jclass, jint) {}
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_configureFenceCadence(JNIEnv *, jclass, jint, jint) {}
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_configureSmallFeed(JNIEnv *, jclass, jint) {}
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_configureOpProfile(JNIEnv *, jclass, jboolean) {}
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_configureDp4a(JNIEnv *, jclass, jboolean) {}

JNIEXPORT jstring JNICALL Java_com_veridity_flow_mind_Lrt_runtimeVersion(JNIEnv * env, jclass) {
  return env->NewStringUTF("llama-hex-0893ec9 (ggml Hexagon, spike)");
}

JNIEXPORT jlong JNICALL Java_com_veridity_flow_mind_Lrt_engineCreate(
    JNIEnv * env, jclass, jstring model_path, jstring backend, jstring, jstring,
    jint max_num_tokens, jstring, jint, jboolean) {
  const char * path = env->GetStringUTFChars(model_path, nullptr);
  const char * be = backend ? env->GetStringUTFChars(backend, nullptr) : nullptr;
  bool want_gpu = be && std::strcmp(be, "gpu") == 0;
  // FastRPC does not search the app's nativeLibraryDir for the HTP skel;
  // point ADSP_LIBRARY_PATH at the dir this stack's libs were loaded from.
  {
    Dl_info info;
    if (dladdr((void *) &llama_backend_init, &info) && info.dli_fname) {
      std::string dir(info.dli_fname);
      size_t slash = dir.find_last_of('/');
      if (slash != std::string::npos) {
        dir.resize(slash);
        setenv("ADSP_LIBRARY_PATH", dir.c_str(), 0);
        setenv("DSP_LIBRARY_PATH", dir.c_str(), 0);
        LOGI("ADSP_LIBRARY_PATH=%s", dir.c_str());
      }
    }
  }
  // Route ggml/llama logs (incl. the fastrpc_mmap error code) to logcat.
  llama_log_set([](ggml_log_level level, const char * text, void *) {
    __android_log_print(level <= GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO,
                        "VFHexGgml", "%s", text);
  }, nullptr);
  llama_backend_init();
  ggml_backend_load_all();

  ggml_backend_dev_t hex_dev = nullptr;
  for (size_t i = 0; i < ggml_backend_dev_count(); i++) {
    ggml_backend_dev_t d = ggml_backend_dev_get(i);
    if (ggml_backend_dev_type(d) == GGML_BACKEND_DEVICE_TYPE_ACCEL ||
        std::strstr(ggml_backend_dev_name(d), "HTP") != nullptr) {
      hex_dev = d;
      break;
    }
  }
  LOGI("engineCreate path=%s backend=%s hex_dev=%s", path, be ? be : "?",
       hex_dev ? ggml_backend_dev_name(hex_dev) : "none");

  llama_model_params mp = llama_model_default_params();
  mp.load_mode = LLAMA_LOAD_MODE_MMAP;
  std::vector<ggml_backend_dev_t> devs;
  if (want_gpu && hex_dev) {
    devs.push_back(hex_dev);
    devs.push_back(nullptr);
    mp.devices = devs.data();
    mp.n_gpu_layers = 99;
  } else {
    mp.n_gpu_layers = 0;
  }
  llama_model * model = llama_model_load_from_file(path, mp);
  env->ReleaseStringUTFChars(model_path, path);
  if (be) env->ReleaseStringUTFChars(backend, be);
  if (!model) { LOGW("model load failed"); return 0; }

  Engine * e = new Engine();
  e->model = model;
  e->vocab = llama_model_get_vocab(model);
  e->hex = want_gpu && hex_dev != nullptr;
  e->n_ctx = max_num_tokens > 0 ? (int) max_num_tokens : 4096;
  if (e->n_ctx > 4096) e->n_ctx = 4096;  // spike cap: HTP rpcmem mapping budget (weights+KV)
  std::lock_guard<std::mutex> lk(g_mu);
  long h = g_next++;
  g_engines[h] = e;
  LOGI("engine ready hex=%d n_ctx=%d", (int) e->hex, e->n_ctx);
  return (jlong) h;
}

JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_engineDelete(JNIEnv *, jclass, jlong h) {
  Engine * e = engine_of(h);
  if (!e) return;
  llama_model_free(e->model);
  std::lock_guard<std::mutex> lk(g_mu);
  g_engines.erase((long) h);
  delete e;
}

JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_engineAttachDraft(JNIEnv *, jclass, jlong, jstring, jint) {
  return -1;  // no draft assistant on the spike path
}
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_sessionEnableDraft(JNIEnv *, jclass, jlong) {
  return -1;
}

JNIEXPORT jlong JNICALL Java_com_veridity_flow_mind_Lrt_sessionCreate(
    JNIEnv *, jclass, jlong eh, jint sampler_type, jint top_k, jfloat top_p,
    jfloat temperature, jint seed, jint max_output, jboolean) {
  Engine * e = engine_of(eh);
  if (!e) return 0;
  llama_context_params cp = llama_context_default_params();
  cp.n_ctx = (uint32_t) e->n_ctx;
  cp.n_batch = 1024;
  cp.n_ubatch = 512;
  cp.type_k = GGML_TYPE_Q8_0;  // halved KV: HTP rpcmem mapping budget
  cp.type_v = GGML_TYPE_Q8_0;
  cp.n_seq_max = 1;
  cp.offload_kqv = true;
  llama_context * ctx = llama_init_from_model(e->model, cp);
  if (!ctx) { LOGW("ctx create failed"); return 0; }
  Session * s = new Session();
  s->ctx = ctx;
  s->vocab = e->vocab;
  s->max_output = max_output > 0 ? (int) max_output : 512;
  s->sampler = make_sampler((int) sampler_type, (int) top_k, (float) top_p,
                            (float) temperature, (int) seed);
  std::lock_guard<std::mutex> lk(g_mu);
  long h = g_next++;
  g_sessions[h] = s;
  return (jlong) h;
}

JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_sessionDelete(JNIEnv *, jclass, jlong h) {
  Session * s = session_of(h);
  if (!s) return;
  if (s->sampler) llama_sampler_free(s->sampler);
  if (s->ctx) llama_free(s->ctx);
  std::lock_guard<std::mutex> lk(g_mu);
  g_sessions.erase((long) h);
  delete s;
}

JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_setSampler(
    JNIEnv *, jclass, jlong h, jint sampler_type, jint top_k, jfloat top_p,
    jfloat temperature, jint seed) {
  Session * s = session_of(h);
  if (!s) return;
  if (s->sampler) llama_sampler_free(s->sampler);
  s->sampler = make_sampler((int) sampler_type, (int) top_k, (float) top_p,
                            (float) temperature, (int) seed);
}

// ── request control (cross-thread cancel) ─────────────────────────────────
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_beginRequest(
    JNIEnv *, jclass, jlong h, jlong generation) {
  Session * s = session_of(h);
  if (!s) return -1;
  s->active_generation = (long) generation;
  s->cancel.store(false);
  return 0;
}
JNIEXPORT jboolean JNICALL Java_com_veridity_flow_mind_Lrt_cancelRequest(
    JNIEnv *, jclass, jlong h, jlong generation) {
  Session * s = session_of(h);
  if (!s) return JNI_FALSE;
  (void) generation;
  s->cancel.store(true);
  return JNI_TRUE;
}
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_endRequest(
    JNIEnv *, jclass, jlong h, jlong) {
  Session * s = session_of(h);
  if (s) s->active_generation = -1;
}
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_cancel(JNIEnv *, jclass, jlong h) {
  Session * s = session_of(h);
  if (s) s->cancel.store(true);
}
// ── prefill / fused generate ────────────────────────────────────────────────
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_prefill(
    JNIEnv * env, jclass, jlong h, jbyteArray utf8) {
  Session * s = session_of(h);
  if (!s) return -1;
  std::string text = bytes_of(env, utf8);
  std::vector<llama_token> toks = tokenize(s->vocab, text, false, true);
  if (toks.empty()) return 0;
  if ((int) (s->history.size() + toks.size()) > (int) llama_n_ctx(s->ctx)) return -1;
  double t0 = now_s();
  if (!decode_tokens(s, toks.data(), (int) toks.size(), true)) return -1;
  s->history.insert(s->history.end(), toks.begin(), toks.end());
  double dt = now_s() - t0;
  s->consumed_prefill = (int) toks.size();
  if (dt > 0) s->bench_prefill.push_back({(int) toks.size(), (int) toks.size() / dt});
  return 0;
}

JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_generateStream(
    JNIEnv * env, jclass, jlong h, jbyteArray utf8, jobject sink) {
  Session * s = session_of(h);
  if (!s || !sink) return -1;
  jclass sink_cls = env->GetObjectClass(sink);
  jmethodID chunk_mid = env->GetMethodID(sink_cls, "chunk", "([BZLjava/lang/String;)V");
  if (!chunk_mid) return -1;
  auto emit = [&](const std::string * piece, bool final, const char * err) {
    jbyteArray arr = nullptr;
    if (piece && !piece->empty()) {
      arr = env->NewByteArray((jsize) piece->size());
      env->SetByteArrayRegion(arr, 0, (jsize) piece->size(),
                              reinterpret_cast<const jbyte *>(piece->data()));
    }
    jstring es = err ? env->NewStringUTF(err) : nullptr;
    env->CallVoidMethod(sink, chunk_mid, arr, (jboolean) final, es);
    if (arr) env->DeleteLocalRef(arr);
    if (es) env->DeleteLocalRef(es);
  };

  std::string text = bytes_of(env, utf8);
  std::vector<llama_token> toks = tokenize(s->vocab, text, false, true);
  if ((int) (s->history.size() + toks.size() + 1) > (int) llama_n_ctx(s->ctx)) {
    emit(nullptr, true, "kv-cache overflow");
    return 0;
  }
  double t0 = now_s();
  if (!toks.empty()) {
    if (!decode_tokens(s, toks.data(), (int) toks.size(), true)) {
      emit(nullptr, true, "kv-cache decode failed");
      return -1;
    }
    s->history.insert(s->history.end(), toks.begin(), toks.end());
  }
  double pre_dt = now_s() - t0;
  s->consumed_prefill = (int) toks.size();
  if (pre_dt > 0 && !toks.empty())
    s->bench_prefill.push_back({(int) toks.size(), (int) (toks.size() / pre_dt)});

  double d0 = now_s();
  int produced = 0;
  const char * term = nullptr;
  while (produced < s->max_output) {
    if (s->cancel.load()) { term = "CANCELLED request"; break; }
    llama_token tok = llama_sampler_sample(s->sampler, s->ctx, -1);
    if (llama_vocab_is_eog(s->vocab, tok)) { term = nullptr; break; }
    if ((int) (s->history.size() + 1) > (int) llama_n_ctx(s->ctx)) {
      term = "kv-cache overflow"; break;
    }
    if (!decode_tokens(s, &tok, 1, true)) { term = "kv-cache decode failed"; break; }
    s->history.push_back(tok);
    produced++;
    std::string piece = piece_of(s->vocab, tok);
    if (!piece.empty()) emit(&piece, false, nullptr);
  }
  if (produced >= s->max_output && !term) term = "Max number of output tokens reached";
  double dec_dt = now_s() - d0;
  s->consumed_decode = produced;
  if (dec_dt > 0 && produced > 0)
    s->bench_decode.push_back({produced, (int) (produced / dec_dt)});
  emit(nullptr, true, term);
  return 0;
}

JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_decodeAsync(
    JNIEnv * env, jclass, jlong h, jobject sink) {
  // Unused by the bounded llama path; treat as an empty continuation stream.
  Session * s = session_of(h);
  if (!s || !sink) return -1;
  jclass sink_cls = env->GetObjectClass(sink);
  jmethodID chunk_mid = env->GetMethodID(sink_cls, "chunk", "([BZLjava/lang/String;)V");
  if (!chunk_mid) return -1;
  env->CallVoidMethod(sink, chunk_mid, nullptr, JNI_TRUE, nullptr);
  return 0;
}

// ── checkpoints (seq-state bytes + token history) ───────────────────────────
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_saveCheckpoint(
    JNIEnv * env, jclass, jlong h, jstring label) {
  Session * s = session_of(h);
  if (!s || !label) return -1;
  const char * lb = env->GetStringUTFChars(label, nullptr);
  Checkpoint cp;
  cp.tokens = s->history;
  size_t need = llama_state_seq_get_size(s->ctx, 0);
  cp.state.resize(need);
  size_t got = need ? llama_state_seq_get_data(s->ctx, cp.state.data(), need, 0) : 0;
  cp.state.resize(got);
  s->checkpoints[lb] = std::move(cp);
  env->ReleaseStringUTFChars(label, lb);
  return 0;
}

JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_rewindToCheckpoint(
    JNIEnv * env, jclass, jlong h, jstring label) {
  Session * s = session_of(h);
  if (!s || !label) return -1;
  const char * lb = env->GetStringUTFChars(label, nullptr);
  auto it = s->checkpoints.find(lb);
  env->ReleaseStringUTFChars(label, lb);
  if (it == s->checkpoints.end()) return -1;
  const Checkpoint & cp = it->second;
  if (!cp.state.empty()) {
    if (llama_state_seq_set_data(s->ctx, cp.state.data(), cp.state.size(), 0) == 0)
      return -1;
  } else {
    llama_memory_seq_rm(llama_get_memory(s->ctx), 0, -1, -1);
  }
  s->history = cp.tokens;
  return 0;
}

JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_retainCheckpoints(
    JNIEnv * env, jclass, jlong h, jobjectArray labels) {
  Session * s = session_of(h);
  if (!s) return -1;
  std::map<std::string, Checkpoint> keep;
  if (labels) {
    jsize n = env->GetArrayLength(labels);
    for (jsize i = 0; i < n; i++) {
      jstring js = (jstring) env->GetObjectArrayElement(labels, i);
      if (!js) continue;
      const char * lb = env->GetStringUTFChars(js, nullptr);
      auto it = s->checkpoints.find(lb);
      if (it != s->checkpoints.end()) keep[lb] = it->second;
      env->ReleaseStringUTFChars(js, lb);
      env->DeleteLocalRef(js);
    }
  }
  s->checkpoints.swap(keep);
  return 0;
}

JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_rewindToStep(
    JNIEnv *, jclass, jlong h, jint step) {
  Session * s = session_of(h);
  if (!s || step < 0 || step > (int) s->history.size()) return -1;
  // Recompute rewind: drop KV past step and truncate history. Sampler reset
  // matches the Java contract ("resets sampler rather than inventing RNG").
  llama_memory_seq_rm(llama_get_memory(s->ctx), 0, (llama_pos) step, -1);
  s->history.resize((size_t) step);
  return 0;
}

JNIEXPORT jintArray JNICALL Java_com_veridity_flow_mind_Lrt_exactCacheTokens(
    JNIEnv * env, jclass, jlong h) {
  Session * s = session_of(h);
  jintArray out = env->NewIntArray(s ? (jsize) s->history.size() : 0);
  if (s && !s->history.empty())
    env->SetIntArrayRegion(out, 0, (jsize) s->history.size(),
                           reinterpret_cast<const jint *>(s->history.data()));
  return out;
}

// ── tokenize / detokenize / misc ────────────────────────────────────────────
JNIEXPORT jintArray JNICALL Java_com_veridity_flow_mind_Lrt_tokenize(
    JNIEnv * env, jclass, jlong eh, jbyteArray utf8) {
  Engine * e = engine_of(eh);
  // Java also passes session handles here in some paths; fall back to any session's vocab.
  const llama_vocab * v = e ? e->vocab : nullptr;
  if (!v && !g_sessions.empty()) v = g_sessions.begin()->second->vocab;
  if (!v) return env->NewIntArray(0);
  std::string text = bytes_of(env, utf8);
  std::vector<llama_token> toks = tokenize(v, text, false, true);
  jintArray out = env->NewIntArray((jsize) toks.size());
  if (!toks.empty())
    env->SetIntArrayRegion(out, 0, (jsize) toks.size(),
                           reinterpret_cast<const jint *>(toks.data()));
  return out;
}

JNIEXPORT jbyteArray JNICALL Java_com_veridity_flow_mind_Lrt_detokenize(
    JNIEnv * env, jclass, jlong eh, jintArray tokens) {
  Engine * e = engine_of(eh);
  const llama_vocab * v = e ? e->vocab : nullptr;
  if (!v && !g_sessions.empty()) v = g_sessions.begin()->second->vocab;
  std::string text;
  if (v && tokens) {
    jsize n = env->GetArrayLength(tokens);
    std::vector<jint> ids((size_t) n);
    if (n) env->GetIntArrayRegion(tokens, 0, n, ids.data());
    for (jint id : ids) text += piece_of(v, (llama_token) id);
  }
  jbyteArray out = env->NewByteArray((jsize) text.size());
  if (!text.empty())
    env->SetByteArrayRegion(out, 0, (jsize) text.size(),
                            reinterpret_cast<const jbyte *>(text.data()));
  return out;
}

JNIEXPORT jstring JNICALL Java_com_veridity_flow_mind_Lrt_stopTokensJson(JNIEnv * env, jclass, jlong eh) {
  Engine * e = engine_of(eh);
  if (!e) return env->NewStringUTF("[]");
  std::string json = "[";
  bool first = true;
  auto add = [&](llama_token t) {
    if (t < 0) return;
    if (!first) json += ",";
    first = false;
    json += "\"" + piece_of(e->vocab, t) + "\"";
  };
  add(llama_vocab_eos(e->vocab));
  add(llama_vocab_eot(e->vocab));
  json += "]";
  return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL Java_com_veridity_flow_mind_Lrt_benchmarkJson(JNIEnv * env, jclass, jlong h) {
  Session * s = session_of(h);
  std::string json = "{\"prefill\":[";
  if (s) {
    bool f = true;
    for (auto & p : s->bench_prefill) {
      if (!f) json += ",";
      f = false;
      char b[64]; std::snprintf(b, sizeof(b), "[%d,%d]", p.first, (int) p.second);
      json += b;
    }
  }
  json += "],\"decode\":[";
  if (s) {
    bool f = true;
    for (auto & p : s->bench_decode) {
      if (!f) json += ",";
      f = false;
      char b[64]; std::snprintf(b, sizeof(b), "[%d,%d]", p.first, (int) p.second);
      json += b;
    }
  }
  json += "]}";
  return env->NewStringUTF(json.c_str());
}

JNIEXPORT jboolean JNICALL Java_com_veridity_flow_mind_Lrt_isLibLoaded(
    JNIEnv * env, jclass, jstring soname) {
  const char * name = env->GetStringUTFChars(soname, nullptr);
  // The hex stack counts as mapped when the HTP skel is packaged; report the
  // ggml/llama libs honestly via /proc/self/maps.
  bool found = false;
  FILE * f = std::fopen("/proc/self/maps", "r");
  if (f) {
    char line[1024];
    while (std::fgets(line, sizeof(line), f)) {
      if (std::strstr(line, name)) { found = true; break; }
    }
    std::fclose(f);
  }
  env->ReleaseStringUTFChars(soname, name);
  return found ? JNI_TRUE : JNI_FALSE;
}

// ── prefix/canonical state: file-backed via seq state (spike subset) ───────
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_savePrefixState(
    JNIEnv * env, jclass, jlong h, jbyteArray, jstring path) {
  Session * s = session_of(h);
  if (!s || !path) return -1;
  const char * p = env->GetStringUTFChars(path, nullptr);
  size_t got = llama_state_seq_save_file(s->ctx, p, 0, s->history.data(), s->history.size());
  env->ReleaseStringUTFChars(path, p);
  return got ? 0 : -1;
}
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_loadPrefixState(
    JNIEnv * env, jclass, jlong h, jbyteArray, jstring path) {
  Session * s = session_of(h);
  if (!s || !path) return -1;
  const char * p = env->GetStringUTFChars(path, nullptr);
  std::vector<llama_token> toks(s->history.size() + 8192);
  size_t n = 0;
  size_t got = llama_state_seq_load_file(s->ctx, p, 0, toks.data(), toks.size(), &n);
  env->ReleaseStringUTFChars(path, p);
  if (!got) return -1;
  s->history.assign(toks.begin(), toks.begin() + (long) n);
  return 0;
}
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_saveCanonicalState(
    JNIEnv *, jclass, jlong, jbyteArray, jstring) { return -1; }
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_loadCanonicalState(
    JNIEnv *, jclass, jlong, jbyteArray, jstring) { return -1; }
JNIEXPORT jstring JNICALL Java_com_veridity_flow_mind_Lrt_restoredCanonicalSegments(
    JNIEnv * env, jclass, jlong) { return env->NewStringUTF(""); }

// ── conversation + debug: fail closed (media/diagnostics only) ─────────────
JNIEXPORT jlong JNICALL Java_com_veridity_flow_mind_Lrt_conversationCreate(
    JNIEnv *, jclass, jlong, jint, jfloat, jfloat, jint, jint) { return 0; }
JNIEXPORT jbyteArray JNICALL Java_com_veridity_flow_mind_Lrt_conversationSendMessage(
    JNIEnv *, jclass, jlong, jbyteArray, jint) { return nullptr; }
JNIEXPORT jint JNICALL Java_com_veridity_flow_mind_Lrt_conversationTokenCount(
    JNIEnv *, jclass, jlong) { return -1; }
JNIEXPORT void JNICALL Java_com_veridity_flow_mind_Lrt_conversationDelete(
    JNIEnv *, jclass, jlong) {}
JNIEXPORT jstring JNICALL Java_com_veridity_flow_mind_Lrt_conversationBenchmarkJson(
    JNIEnv * env, jclass, jlong) { return env->NewStringUTF("{}"); }
JNIEXPORT jbyteArray JNICALL Java_com_veridity_flow_mind_Lrt_debugSequenceState(
    JNIEnv *, jclass, jlong, jstring) { return nullptr; }
JNIEXPORT jbyteArray JNICALL Java_com_veridity_flow_mind_Lrt_debugLogits(
    JNIEnv *, jclass, jlong, jstring) { return nullptr; }
JNIEXPORT jintArray JNICALL Java_com_veridity_flow_mind_Lrt_debugSamplerProbe(
    JNIEnv * env, jclass, jlong, jstring, jboolean, jint) { return env->NewIntArray(0); }

JNIEXPORT jstring JNICALL Java_com_veridity_flow_mind_Lrt_requestStateJson(JNIEnv * env, jclass, jlong h) {
  Session * s = session_of(h);
  char buf[256];
  if (!s) return env->NewStringUTF("{}");
  std::snprintf(buf, sizeof(buf),
      "{\"consumedPrefillTokens\":%d,\"consumedDecodeTokens\":%d,\"cancelled\":%s}",
      s->consumed_prefill, s->consumed_decode, s->cancel.load() ? "true" : "false");
  return env->NewStringUTF(buf);
}

}  // extern "C"


