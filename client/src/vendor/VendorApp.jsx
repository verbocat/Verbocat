import { useState, useEffect, useCallback } from "react";
import { useUserStore } from "../services/userStore";
import { VendorHeader } from "./VendorHeader";
import { VendorLogin } from "./VendorLogin";
import { VendorDashboard } from "./VendorDashboard";
import { OnboardingRequests } from "./OnboardingRequests";
import { LinguistDatabase } from "./LinguistDatabase";
import { LinguistProfile } from "./LinguistProfile";
import { SettingsModal } from "../components/SettingsModal";
import { ShieldAlert, ArrowLeft } from "lucide-react";

function parseVendorRoute() {
  const path = window.location.pathname;

  // /vendor/login
  if (path.startsWith("/vendor/login")) {
    return { screen: "login" };
  }

  // /vendor/onboarding
  if (path.startsWith("/vendor/onboarding")) {
    return { screen: "onboarding" };
  }

  // /vendor/linguists/new
  if (path === "/vendor/linguists/new") {
    return { screen: "linguist-new" };
  }

  // /vendor/linguists/:id
  const linguistMatch = path.match(/^\/vendor\/linguists\/([^/]+)/);
  if (linguistMatch) {
    return { screen: "linguist-profile", linguistId: linguistMatch[1] };
  }

  // /vendor/linguists
  if (path.startsWith("/vendor/linguists")) {
    return { screen: "linguists" };
  }

  // /vendor/dashboard or /vendor
  return { screen: "dashboard" };
}

export function VendorApp() {
  const { isAuth, user, fetchProfile } = useUserStore();
  const [route, setRoute] = useState(() => parseVendorRoute());
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseVendorRoute());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Fetch profile on mount if authenticated
  useEffect(() => {
    if (isAuth) {
      fetchProfile();
    }
  }, [isAuth]);

  const navigateTo = useCallback((path) => {
    window.history.pushState(null, "", path);
    setRoute(parseVendorRoute());
  }, []);

  // Check if user has vendor access
  const hasVendorAccess = user && ["vendor", "admin", "super_admin", "verbolabs_staff"].includes(user.role);

  if (route.screen === "login" || !isAuth) {
    return <VendorLogin onNavigate={navigateTo} />;
  }

  // Authenticated but not vendor role
  if (!hasVendorAccess) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)] p-4">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 text-rose-400">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Access Denied</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
            Your account (<span className="text-indigo-400 font-mono">{user?.email}</span>) does not have Vendor Portal permissions.
            Only Vendor Team members and Admins can access this portal.
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="/"
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} /> Back to Translation Workspace
            </a>
            <button
              onClick={() => {
                useUserStore.getState().logout();
                navigateTo("/vendor/login");
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium transition-colors"
            >
              Sign In with Different Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine current screen name for nav highlighting
  const currentScreen = route.screen === "linguist-profile" || route.screen === "linguist-new"
    ? "linguists"
    : route.screen;

  return (
    <div className="min-h-screen w-full flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)] font-sans antialiased selection:bg-indigo-500/20">
      <VendorHeader
        currentScreen={currentScreen}
        onNavigate={navigateTo}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      <main className="flex-1 overflow-y-auto">
        {route.screen === "dashboard" && (
          <VendorDashboard onNavigate={navigateTo} />
        )}

        {route.screen === "onboarding" && (
          <OnboardingRequests onNavigate={navigateTo} />
        )}

        {route.screen === "linguists" && (
          <LinguistDatabase onNavigate={navigateTo} />
        )}

        {route.screen === "linguist-new" && (
          <LinguistProfile onNavigate={navigateTo} isNew={true} />
        )}

        {route.screen === "linguist-profile" && (
          <LinguistProfile
            linguistId={route.linguistId}
            onNavigate={navigateTo}
          />
        )}
      </main>

      {/* Global Workspace Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          show={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          userRole={user?.role}
          userEmail={user?.email}
          userId={user?.id}
        />
      )}
    </div>
  );
}
