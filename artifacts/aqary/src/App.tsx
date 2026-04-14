import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ChatWidget } from "@/components/chat/ChatWidget";

// Pages
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Properties from "@/pages/properties";
import PropertyDetail from "@/pages/property-detail";
import Dashboard from "@/pages/dashboard";
import Admin from "@/pages/admin";
import Saved from "@/pages/saved";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/properties" component={Properties} />
      <Route path="/property/:id" component={PropertyDetail} />
      
      <Route path="/dashboard">
        <ProtectedRoute allowedRoles={["seller", "admin"]}>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Admin />
        </ProtectedRoute>
      </Route>
      
      <Route path="/saved">
        <ProtectedRoute>
          <Saved />
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
            <ChatWidget />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
