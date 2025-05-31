import { 
  BarChart3, 
  Settings, 
  Phone, 
  Users, 
  BrainCircuit
} from "lucide-react";

export const sidebarItems = [
  {
    title: "Overview",
    href: "/admin",
    icon: BarChart3,
  },
  {
    title: "Call Logs",
    href: "/admin/call-logs",
    icon: Phone,
  },
  {
    title: "Patients Archive",
    href: "/admin/patients",
    icon: Users,
  },
  {
    title: "AI Config",
    href: "/admin/ai-config",
    icon: BrainCircuit,
  },
  {
    title: "Setup",
    href: "/admin/setup",
    icon: Settings,
  },
]; 