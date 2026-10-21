import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { App } from "@/components/app"
import "highlight.js/styles/github-dark.css"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider delay={300}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
