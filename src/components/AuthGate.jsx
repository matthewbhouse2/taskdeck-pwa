import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { installStorageShim } from "../lib/storageShim";
import App from "../App.jsx";

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [shimReady, setShimReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      installStorageShim(session.user.id);
      setShimReady(true);
    } else {
      setShimReady(false);
    }
  }, [session]);

  const sendLink = async (e) => {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
  };

  const signOut = () => supabase.auth.signOut();

  if (session === undefined) {
    return (
      <div style={shellStyle}>
        <div style={{ color: "#7C5D64", fontFamily: "monospace", fontSize: 13 }}>loading…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={shellStyle}>
        <form onSubmit={sendLink} style={cardStyle}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: "#C33B4A", boxShadow: "0 0 8px #C33B4A", marginBottom: 14 }} />
          <div style={{ fontSize: 20, fontWeight: 700, color: "#F5E9E2", marginBottom: 6 }}>TaskDeck</div>
          <div style={{ fontSize: 13, color: "#B99AA0", marginBottom: 20 }}>
            {sent ? "Check your email for a sign-in link." : "Enter your email to sign in — no password needed."}
          </div>
          {!sent && (
            <>
              <input
                type="email" required value={email} placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                style={{ background: "#2E1D2A", border: "1px solid #3D2733", borderRadius: 8, color: "#F5E9E2", padding: "10px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 12 }}
              />
              <button type="submit" style={{ background: "#4A1E22", color: "#C33B4A", border: "1px solid #C33B4A55", borderRadius: 8, padding: "10px 0", width: "100%", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                SEND SIGN-IN LINK
              </button>
            </>
          )}
          {error && <div style={{ color: "#E2603A", fontSize: 12, marginTop: 10 }}>{error}</div>}
        </form>
      </div>
    );
  }

  if (!shimReady) {
    return (
      <div style={shellStyle}>
        <div style={{ color: "#7C5D64", fontFamily: "monospace", fontSize: 13 }}>connecting…</div>
      </div>
    );
  }

  return <App onSignOut={signOut} />;
}

const shellStyle = {
  minHeight: "100vh", background: "#150F13", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 20,
};
const cardStyle = {
  background: "#231721", border: "1px solid #3D2733", borderRadius: 16,
  padding: 26, width: "100%", maxWidth: 360,
};
