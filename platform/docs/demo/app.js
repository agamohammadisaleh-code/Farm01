const API = ""; // همان مبدأ صفحه؛ صفحه توسط خود API سرو می‌شود
let token = sessionStorage.getItem("farm_token") || "";
let flocks = [];
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function addMessage(text, who, extra) {
  const box = el("div", "msg " + who);
  box.textContent = text;
  if (extra) {
    const meta = el("div", "meta", extra);
    box.appendChild(meta);
  }
  $("chat").appendChild(box);
  $("chat").scrollIntoView({ block: "end" });
  return box;
}

async function api(path, options = {}) {
  const res = await fetch(API + "/api/v1" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "خطا در ارتباط با سرور");
  return body;
}

/* ------------------------------- ورود ------------------------------- */

async function login() {
  try {
    const body = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("email").value.trim(), password: $("password").value }),
    });
    token = body.accessToken;
    sessionStorage.setItem("farm_token", token);
    await boot();
  } catch (error) {
    alert(error.message);
  }
}

async function boot() {
  if (!token) return;
  try {
    flocks = await api("/flocks");
  } catch {
    token = "";
    sessionStorage.removeItem("farm_token");
    return;
  }
  $("loginCard").classList.add("hidden");
  $("appCard").classList.remove("hidden");

  $("flock").innerHTML = "";
  for (const f of flocks) {
    const opt = el("option", null, `${f.name} — ${f.status === "active" ? "فعال" : "بسته"}`);
    opt.value = f.id;
    $("flock").appendChild(opt);
  }

  const examples = await api("/assistant/examples");
  $("chips").innerHTML = "";
  for (const item of examples.examples) {
    const chip = el("button", "chip", item.text);
    chip.onclick = () => { $("text").value = item.text; send(); };
    $("chips").appendChild(chip);
  }
  $("voiceHint").textContent = examples.tips.find((t) => t.includes("تأیید")) || "";
  setupVoice();
}

/* ------------------------------ ارسال متن ------------------------------ */

async function send(presetText) {
  const text = (presetText || $("text").value).trim();
  if (!text) return;
  $("text").value = "";
  addMessage(text, "me");

  try {
    const res = await api("/assistant/message", {
      method: "POST",
      body: JSON.stringify({ text, flockId: $("flock").value }),
    });
    renderReply(res, text);
  } catch (error) {
    addMessage(error.message, "bot warnbox");
  }
}

function renderReply(res, originalText) {
  const cls = res.kind === "answer" ? "bot answer" : res.kind === "done" ? "bot" : "bot";
  const box = addMessage(res.reply, cls);

  const meta = el("div", "meta");
  const badge = el("span", "badge", {
    draft: "پیشنهاد ثبت",
    done: "ثبت شد",
    answer: "پاسخ",
    clarify: "نیاز به تکمیل",
    unknown: "نفهمیدم",
    help: "راهنما",
  }[res.kind] || res.kind);
  if (res.kind === "clarify" || res.kind === "unknown") badge.className = "badge warn";
  meta.appendChild(badge);
  meta.appendChild(document.createTextNode(" اطمینان: " + Math.round((res.confidence || 0) * 100) + "٪"));
  if (res.flock) meta.appendChild(document.createTextNode(" · " + res.flock.name));
  box.appendChild(meta);

  if (res.kind === "draft") {
    const actions = el("div", "actions");
    const ok = el("button", null, "ثبت کن");
    const cancel = el("button", "ghost", "نه، اصلاح می‌کنم");
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        const done = await api("/assistant/confirm", {
          method: "POST",
          body: JSON.stringify({ text: originalText, flockId: $("flock").value, confirm: true }),
        });
        actions.remove();
        addMessage(done.reply, "bot");
      } catch (error) {
        actions.remove();
        addMessage(error.message, "bot warnbox");
      }
    };
    cancel.onclick = () => {
      actions.remove();
      $("text").value = originalText;
      $("text").focus();
    };
    actions.append(ok, cancel);
    box.appendChild(actions);
  }
}

/* ------------------------------- صدا ------------------------------- */

let recognition = null;
let recorder = null;

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "fa-IR";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      $("text").value = event.results[0][0].transcript;
      send();
    };
  }
  if (!window.isSecureContext || !navigator.mediaDevices) {
    $("micBtn").disabled = true;
    $("micBtn").title = "میکروفن نیاز به اتصال امن (https) دارد";
  }
}

async function toggleRecording() {
  // مسیر اول: موتور گفتار خود مرورگر (آفلاین برای کاربر، بدون ارسال صدا)
  if (recognition && !recorder) {
    try {
      recognition.start();
      return;
    } catch {
      /* ادامه به ضبط و ارسال به سرور */
    }
  }

  if (recorder) {
    recorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    $("micBtn").classList.add("recording");

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      $("micBtn").classList.remove("recording");
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      recorder = null;

      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
        reader.readAsDataURL(blob);
      });

      addMessage("(صدا ضبط شد — در حال تبدیل به متن)", "me");
      try {
        const res = await api("/assistant/voice", {
          method: "POST",
          body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || "audio/webm" }),
        });
        $("text").value = res.text;
        send();
      } catch (error) {
        addMessage(
          error.message + "\n\nاین صفحه همان‌طور که طراحی شده عمل کرد: تبدیل گفتار روی سرور نصب نیست، " +
          "پس به موتور گفتار دستگاه برمی‌گردد. در کروم با دکمه میکروفن دوباره امتحان کنید یا جمله را تایپ کنید.",
          "bot warnbox",
        );
      }
    };

    recorder.start();
  } catch {
    addMessage("دسترسی به میکروفن ممکن نشد. جمله را تایپ کنید.", "bot warnbox");
  }
}

/* -------------------------------- اتصال -------------------------------- */

$("loginBtn").onclick = login;
$("sendBtn").onclick = () => send();
$("micBtn").onclick = toggleRecording;
$("text").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

if (token) boot();
