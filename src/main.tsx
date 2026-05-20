import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { open } from '@tauri-apps/plugin-shell'

window.__open = (url: string) => open(url)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
