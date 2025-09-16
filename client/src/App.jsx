import { Globe, Loader2, Moon, ShieldAlert, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Cell, Legend, PieChart, Pie as PieSlice, ResponsiveContainer, Tooltip } from "recharts";

export default function App() {
  // scan UI state
  const [url, setUrl] = useState("");
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState("idle"); // "idle" | "scanning" | "done"
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [inputError, setInputError] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  // chat assistant state
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // resizable chat box state
  const [chatSize, setChatSize] = useState({ width: 500, height: 300 });
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef(null);
  const chatBoxRef = useRef(null);

  // small constants
  const severityColors = {
    Critical: "#dc2626",
    High: "#ea580c",
    Medium: "#f59e0b",
    Low: "#65a30d",
  };

  function validateUrl(u) {
    if (!u || u.trim() === "") return false;
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  }

  function resetForNewScan() {
    setResult(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
    setInputError(null);
    setUrl("");
    setLevel(1);
  }

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const pieDataFromSummary = (summary = {}) => {
    const order = ["Critical", "High", "Medium", "Low"];
    return order.map((k) => ({ name: k, value: summary[k] || 0 }));
  };

  // -----------------------
  // Scan handling
  // -----------------------
  async function handleScan(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setResult(null);
    setInputError(null);
    setProgress(0);

    if (!validateUrl(url)) {
      setInputError("⚠ Please enter a valid URL (http:// or https://)");
      return;
    }

    setStatus("scanning");

    try {
      const res = await fetch("http://localhost:5000/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, level }),
      });

      // fake progress animation while waiting
      let prog = 0;
      const interval = setInterval(() => {
        prog = Math.min(95, prog + Math.floor(Math.random() * 8) + 3);
        setProgress(prog);
      }, 600);

      let data;
      try {
        data = await res.json();
      } catch {
        clearInterval(interval);
        setError("Server returned invalid response");
        setStatus("idle");
        return;
      }

      clearInterval(interval);
      setProgress(100);

      if (!res.ok) {
        setError(data.error || "Scan failed");
        setStatus("idle");
        return;
      }

      const normalized = {
        target: data.target || url,
        level: data.level || level,
        summary: data.summary || { Critical: 0, High: 0, Medium: 0, Low: 0 },
        vulnerabilities: data.vulnerabilities || [],
        ai_summary: data.ai_summary || null,
      };

      setResult(normalized);
      setStatus("done");
    } catch (err) {
      setError(err.message || "Network error");
      setStatus("idle");
    }
  }

  // -----------------------
  // Chat Assistant
  // -----------------------
  async function sendMessage(e) {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = { sender: "user", text: chatInput };
    setChatHistory((h) => [...h, userMessage]);

    try {
      // Not sending scan context by default; could add include_scan: true to request body
      const res = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatInput }),
      });

      const data = await res.json();
      if (res.ok) {
        setChatHistory((h) => [...h, { sender: "ai", text: data.reply }]);
      } else {
        setChatHistory((h) => [...h, { sender: "ai", text: "⚠ " + (data.error || "Error") }]);
      }
    } catch (err) {
      setChatHistory((h) => [...h, { sender: "ai", text: "⚠ Network error" }]);
    }

    setChatInput("");
  }

  // auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory, result]);

  // -----------------------
  // Resizing logic
  // -----------------------
  function startResize(e) {
    e.preventDefault();
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: chatSize.width,
      startHeight: chatSize.height,
    };
    setResizing(true);
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (!resizing || !resizeStartRef.current) return;
      const { startX, startY, startWidth, startHeight } = resizeStartRef.current;
      // width grows when mouse moves right, height grows when mouse moves down
      const newWidth = Math.max(260, Math.round(startWidth + (e.clientX - startX)));
      const newHeight = Math.max(300, Math.round(startHeight + (e.clientY - startY)));
      setChatSize({ width: newWidth, height: newHeight });
    }
    function onMouseUp() {
      if (resizing) {
        setResizing(false);
        resizeStartRef.current = null;
      }
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing]);

  // -----------------------
  // JSX
  // -----------------------
  return (
    <div className={`${darkMode ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"} min-h-screen font-sans`}>
      {/* Header */}
      <header className={`${darkMode ? "bg-gray-900 text-white" : "bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white"} text-center py-16 shadow-lg relative`}>
        <div className="flex justify-center items-center gap-4">
          <ShieldAlert size={52} className="drop-shadow-lg" />
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">AUTONOMOUS BUG BOUNTY</h1>
        </div>
        <p className="mt-4 text-lg max-w-2xl mx-auto opacity-90">
          🔍 Vulnerability scanning powered by <span className="font-semibold">OWASP ZAP</span> + AI assistant
        </p>
        <button onClick={toggleDarkMode} className="absolute top-6 right-6 p-3 rounded-full bg-black/20 hover:bg-black/30 transition">
          {darkMode ? <Sun /> : <Moon />}
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-16 space-y-16">
        {/* Scan Form */}
        {!result && (
          <div
            className={`${darkMode ? "bg-gray-800" : "bg-white/95"} backdrop-blur-md p-14 rounded-3xl border max-w-5xl mx-auto
              shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)]`}
          >
            <form onSubmit={handleScan} className="flex flex-col lg:flex-row gap-6 items-center">
              <div className="flex-1 relative">
                <Globe className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full pl-14 pr-5 py-4 border-2 rounded-2xl focus:ring-4 focus:ring-emerald-300 shadow-md text-base bg-white"
                  placeholder="Enter target URL (e.g., https://example.com)"
                  aria-label="target-url"
                />
              </div>

              <select
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value))}
                className="border-2 rounded-2xl px-6 py-3 shadow-md bg-white text-base"
                aria-label="scan-level"
              >
                <option value={1}>Level 1 — Basic</option>
                <option value={2}>Level 2 — Code Level</option>
                <option value={3}>Level 3 — Firewall Level</option>
              </select>

              <button
                type="submit"
                disabled={status === "scanning"}
                className="appearance-none flex items-center justify-center gap-3 px-8 py-3 rounded-2xl 
                          text-white bg-gradient-to-r from-emerald-600 to-emerald-500
                          hover:from-emerald-700 hover:to-emerald-900
                          hover:scale-105 hover:shadow-xl 
                          transition disabled:opacity-60 focus:outline-none"
                aria-label="start-scan"
              >
                {status === "scanning" ? (
                  <>
                    <Loader2 className="animate-spin" /> <span>Scanning...</span>
                  </>
                ) : (
                  <span>Start Scan</span>
                )}
              </button>
            </form>

            {inputError && <div className="text-red-600 mt-4">{inputError}</div>}
            {error && <div className="text-red-600 mt-4">❌ {error}</div>}
          </div>
        )}

        {/* Scan Results */}
        {result && (
          <div className="space-y-12">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
              {["Critical", "High", "Medium", "Low"].map((sev) => (
                <div key={sev} className="p-6 rounded-2xl shadow-lg border bg-white">
                  <div className="h-2 w-full rounded-t-md" style={{ backgroundColor: severityColors[sev] }} />
                  <h3 className="text-lg font-bold mt-4" style={{ color: severityColors[sev] }}>{sev}</h3>
                  <p className="text-4xl font-extrabold mt-3">{(result.summary && result.summary[sev]) || 0}</p>
                </div>
              ))}
            </div>

            {/* Heatmap */}
            <div className="bg-white p-8 rounded-3xl shadow-xl border">
              <h3 className="text-2xl font-semibold mb-6 text-emerald-700">🗺️ Severity Heatmap</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <PieSlice
                    data={pieDataFromSummary(result.summary)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label
                  >
                    {pieDataFromSummary(result.summary).map((entry) => (
                      <Cell key={entry.name} fill={severityColors[entry.name]} />
                    ))}
                  </PieSlice>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Vulnerabilities */}
            <div className="bg-white p-8 rounded-3xl shadow-xl border space-y-6">
              <h3 className="text-3xl font-semibold text-emerald-700">🛡️ Detected Vulnerabilities</h3>

              {(!result.vulnerabilities || result.vulnerabilities.length === 0) ? (
                <p className="text-gray-500 italic text-center">No vulnerabilities found in this scan — nice!</p>
              ) : (
                result.vulnerabilities.map((v, i) => (
                  <div key={i} className="border rounded-xl p-6 shadow hover:shadow-lg transition bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xl" style={{ color: severityColors[v.risk] }}>{v.name}</span>
                      <span className="text-sm text-gray-500">{v.params?.length > 0 ? v.params.join(", ") : null}</span>
                    </div>
                    <p className="text-sm text-gray-600"><em>{v.risk}</em></p>
                    <div className="mt-3 text-base space-y-2">
                      <div><strong>URLs:</strong> {v.urls?.join(", ")}</div>
                      {v.params?.length > 0 && <div><strong>Parameters:</strong> {v.params.join(", ")}</div>}
                      <div><strong>Solution:</strong> {v.solution}</div>
                      {v.extra_suggestion && <div className="text-sm text-emerald-700"><strong>Suggestion:</strong> {v.extra_suggestion}</div>}
                    </div>
                  </div>
                ))
              )}

              {/* download + scan again */}
              <div className="flex justify-between items-center mt-6">
                <div />
                <div className="flex gap-3">
                  <button onClick={resetForNewScan} className="px-4 py-2 rounded-lg border hover:bg-emerald-50 transition">
                    Scan another URL
                  </button>
                  <button
                    onClick={() => window.open("http://localhost:5000/api/report/pdf", "_blank")}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                  >
                    📄 Download Report as PDF
                  </button>
                </div>
              </div>
            </div>

            {/* AI Report */}
            {result.ai_summary && (
              <div className="bg-gray-900 text-green-300 p-6 rounded-2xl shadow-inner border">
                <h3 className="text-xl font-bold mb-3">🤖 AI Security Report</h3>
                <div className="prose max-w-none">
                  <ReactMarkdown>{result.ai_summary.toString()}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* AI Chat Assistant (resizable) */}
      <div className="fixed bottom-6 right-6 z-50">
        <div
          className="bg-white shadow-xl rounded-2xl flex flex-col overflow-hidden border relative"
          style={{ width: chatSize.width, height: chatSize.height, minWidth: 260, minHeight: 300 }}
        >
          <div className="bg-emerald-600 text-white px-4 py-2 font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>🤖</span>
              <span>AI Assistant</span>
            </div>
            <div className="text-xs opacity-80">Resizable — drag corner</div>
          </div>

          <div ref={chatBoxRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm bg-white">
            {chatHistory.length === 0 && (
              <div className="text-gray-400 italic text-center mt-6">Ask the assistant anything — e.g., "How fix SQLi?"</div>
            )}
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg max-w-[80%] ${msg.sender === "user" ? "bg-emerald-100 ml-auto text-right" : "bg-gray-100 mr-auto text-left"}`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <form onSubmit={sendMessage} className="flex border-t bg-gray-50">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask me anything..."
              className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
            />
            <button type="submit" className="px-4 bg-emerald-600 text-white hover:bg-emerald-700 transition">Send</button>
          </form>

          {/* resize handle */}
          <div
            onMouseDown={startResize}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-gray-300 rounded-tl"
            title="Drag to resize"
          />
        </div>
      </div>
    </div>
  );
}
