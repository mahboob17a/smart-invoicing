import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveToken, getToken, clearToken } from "../api/client";

const AuthContext = createContext(null);

async function loadSteps(organization) {
  if (organization.onboardingComplete) return null;
  const status = await api.getOnboardingStatus();
  return status.steps;
}

export function AuthProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [organization, setOrganization] = useState(null);
  const [user, setUser] = useState(null);
  const [onboardingSteps, setOnboardingSteps] = useState(null);

  // Restore the session on cold start. Onboarding progress is fetched before
  // the navigator mounts, so the wizard opens on the first unsaved step.
  useEffect(() => {
    (async () => {
      try {
        if (!(await getToken())) return;
        const me = await api.getMe();
        setOnboardingSteps(await loadSteps(me.organization));
        setOrganization(me.organization);
        setUser(me.user);
      } catch {
        await clearToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const start = useCallback(async (result) => {
    await saveToken(result.token);
    setOnboardingSteps(await loadSteps(result.organization));
    setOrganization(result.organization);
    setUser(result.user);
    return result;
  }, []);

  const signup = useCallback(async (payload) => start(await api.signup(payload)), [start]);
  const login = useCallback(async (payload) => start(await api.login(payload)), [start]);

  const signOut = useCallback(async () => {
    await clearToken();
    setOrganization(null);
    setUser(null);
    setOnboardingSteps(null);
  }, []);

  const markStepDone = useCallback((key) => {
    setOnboardingSteps((prev) => (prev ? { ...prev, [key]: true } : prev));
  }, []);

  // Called from the "You're all set" screen so the switch to the main app
  // happens when the user taps through, not the instant the last form saves.
  const markOnboardingComplete = useCallback(() => {
    setOrganization((prev) => (prev ? { ...prev, onboardingComplete: true } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isSignedIn: !!user,
        organization,
        user,
        onboardingSteps,
        signup,
        login,
        signOut,
        markStepDone,
        markOnboardingComplete,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
