// The ElevenLabs voice agent as a floating "call CampusOS" bubble. It files and checks tickets through the
// CampusOS MCP server. Shown only when ELEVENLABS_AGENT_ID is set; the signed-in student's USN is passed in as
// the {{usn}} dynamic variable so voice reports land in their portal.
import { useEffect, useState } from "react";
import { api, useMe } from "../lib/api.jsx";

let loaded;
const loadWidget = () => (loaded ??= new Promise((ok, bad) => {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/@elevenlabs/convai-widget-embed";
  s.async = true;
  s.onload = ok;
  s.onerror = () => ((loaded = null), bad(new Error("voice agent script failed")));
  document.head.appendChild(s);
}));

export default function VoiceAgent() {
  const [agentId, setAgentId] = useState(null);
  const { user } = useMe();
  useEffect(() => {
    api("/api/config").then((c) => c.agentId && loadWidget().then(() => setAgentId(c.agentId), () => {}), () => {});
  }, []);
  if (!agentId) return null;
  return (
    <elevenlabs-convai
      key={user?.usn ?? "anon"}
      agent-id={agentId}
      dynamic-variables={JSON.stringify({ usn: user?.usn || (user && !["technician", "dept_head", "admin"].includes(user.role) ? user.email : "anon"), name: user?.name ?? "student" })}
      action-text="Talk to CampusOS"
      start-call-text="Report by voice"
    />
  );
}
