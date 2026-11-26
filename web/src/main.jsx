import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/commissioner/flar.css";
import "@fontsource/fragment-mono/400.css";
import "./styles.css";
import "./app/app.css";
import { usePath } from "./lib/api.jsx";
import { Nav } from "./app/Nav.jsx";

const Landing = lazy(() => import("./landing/Landing.jsx"));
const Report = lazy(() => import("./app/Report.jsx"));
const Status = lazy(() => import("./app/Status.jsx"));
const Admin = lazy(() => import("./app/Admin.jsx"));
const Wifi = lazy(() => import("./app/Wifi.jsx"));
const Login = lazy(() => import("./app/Login.jsx"));
const Me = lazy(() => import("./app/Me.jsx"));
const Profile = lazy(() => import("./app/Profile.jsx"));
const VoiceAgent = lazy(() => import("./app/VoiceAgent.jsx"));

function App() {
  const path = usePath();
  const ticket = /^\/t\/(T\d+)$/i.exec(path);
  const page =
    path === "/report" ? <Report /> :
    path === "/admin" ? <Admin /> :
    path === "/wifi" ? <Wifi /> :
    path === "/login" ? <Login /> :
    path === "/me" ? <Me /> :
    path === "/profile" ? <Profile /> :
    ticket ? <Status id={ticket[1].toUpperCase()} /> :
    <Landing />;
  return (
    <>
      <Nav path={path} />
      <Suspense fallback={<div className="page-loading" />}>{page}</Suspense>
      {/* voice agent on the student-facing pages */}
      {(path === "/report" || path === "/me" || ticket) && <Suspense fallback={null}><VoiceAgent /></Suspense>}
      <div className="grain" aria-hidden="true" />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
