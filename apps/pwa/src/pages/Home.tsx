import { useEffect } from "react";
import { useLocation } from "wouter";

// Redirect helper — the Dashboard is mounted at "/", so Home simply forwards.
export default function Home() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/");
  }, [navigate]);
  return null;
}
