"use client";

import { useEffect, useState } from "react";

import type { RegistrationMode } from "@/src/lib/constants";
import {
  buildUserInfoUpdateRequest,
  hydrateUser,
  type ServerUserInfo,
  type UserInfo,
} from "@/src/features/account-settings/contracts";
import type { GatewayInfo } from "@/src/features/gateways/contracts";
import type { ApiKeyInfo, RoutingDraftState } from "@/src/components/admin/types";

interface RegistrationStatus {
  mode: RegistrationMode;
  signupAllowed: boolean;
  firstUser: boolean;
  requiresInviteCode: boolean;
}

export function useAdminData() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | undefined>();
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [reroutingDraftState, setReroutingDraftState] = useState<RoutingDraftState>("pristine");
  const [profilesDraftState, setProfilesDraftState] = useState<RoutingDraftState>("pristine");
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("closed");
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);

  async function fetchAdminData() {
    const [userRes, keysRes, gatewaysRes, registrationRes] = await Promise.all([
      fetch("/api/v1/user/me", { cache: "no-store" }),
      fetch("/api/v1/user/keys", { cache: "no-store" }),
      fetch("/api/v1/user/gateways", { cache: "no-store" }),
      fetch("/api/v1/auth/registration-status", { cache: "no-store" }),
    ]);

    const registrationData = registrationRes.ok
      ? await registrationRes.json() as RegistrationStatus
      : {
          mode: "closed",
          signupAllowed: false,
          firstUser: false,
          requiresInviteCode: false,
        } satisfies RegistrationStatus;

    return {
      userRes,
      keysRes,
      gatewaysRes,
      registrationData,
    };
  }

  async function resolveAuth() {
    setIsCheckingAuth(true);
    setStatus("Loading...");
    setError(undefined);

    const { userRes, keysRes, gatewaysRes, registrationData } = await fetchAdminData();
    setRegistrationMode(registrationData.mode);
    setRegistrationStatus(registrationData);

    if (!userRes.ok) {
      setIsAuthenticated(false);
      setUser(null);
      setKeys([]);
      setGateways([]);
      setStatus("Please log in");
      setIsCheckingAuth(false);
      return;
    }

    if (!keysRes.ok) {
      setError("Failed to load API keys");
      setStatus("Error");
      setIsCheckingAuth(false);
      return;
    }

    const userData = await userRes.json() as { user: ServerUserInfo };
    const keysData = await keysRes.json() as { keys: ApiKeyInfo[] };

    if (gatewaysRes.ok) {
      const gatewaysData = await gatewaysRes.json() as { gateways?: GatewayInfo[] };
      setGateways(gatewaysData.gateways ?? []);
    } else {
      setGateways([]);
    }

    setUser(hydrateUser(userData.user));
    setKeys(keysData.keys);
    setIsAuthenticated(true);
    setReroutingDraftState("pristine");
    setProfilesDraftState("pristine");
    setStatus("Ready");
    setIsCheckingAuth(false);
  }

  async function loadData() {
    setStatus("Loading...");
    setError(undefined);

    const { userRes, keysRes, gatewaysRes, registrationData } = await fetchAdminData();
    setRegistrationMode(registrationData.mode);
    setRegistrationStatus(registrationData);

    if (!userRes.ok) {
      setIsAuthenticated(false);
      setUser(null);
      setKeys([]);
      setGateways([]);
      setStatus("Please log in");
      return;
    }

    if (!keysRes.ok) {
      setError("Failed to load API keys");
      setStatus("Error");
      return;
    }

    const userData = await userRes.json() as { user: ServerUserInfo };
    const keysData = await keysRes.json() as { keys: ApiKeyInfo[] };

    if (gatewaysRes.ok) {
      const gatewaysData = await gatewaysRes.json() as { gateways?: GatewayInfo[] };
      setGateways(gatewaysData.gateways ?? []);
    } else {
      setGateways([]);
    }

    setUser(hydrateUser(userData.user));
    setKeys(keysData.keys);
    setIsAuthenticated(true);
    setReroutingDraftState("pristine");
    setProfilesDraftState("pristine");
    setStatus("Ready");
  }

  useEffect(() => {
    void resolveAuth();
  }, []);

  async function refreshRegistrationStatus() {
    const response = await fetch("/api/v1/auth/registration-status", { cache: "no-store" });
    if (!response.ok) {
      setRegistrationMode("closed");
      setRegistrationStatus({
        mode: "closed",
        signupAllowed: false,
        firstUser: false,
        requiresInviteCode: false,
      });
      return;
    }

    const data = await response.json() as RegistrationStatus;
    setRegistrationMode(data.mode);
    setRegistrationStatus(data);
  }

  async function handleLogout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    setIsAuthenticated(false);
    setUser(null);
    setKeys([]);
    setGateways([]);
    setReroutingDraftState("pristine");
    setProfilesDraftState("pristine");
    setStatus("Logged out");
    await refreshRegistrationStatus();
  }

  function markReroutingDirty() {
    setReroutingDraftState((current) => (current === "dirty" ? current : "dirty"));
  }

  function markProfilesDirty() {
    setProfilesDraftState((current) => (current === "dirty" ? current : "dirty"));
  }

  async function saveUserData(updates: Partial<UserInfo>) {
    if (!user) {
      return false;
    }

    setStatus("Saving...");
    setError(undefined);

    const payload = buildUserInfoUpdateRequest({
      expectedUpdatedAt: user.updatedAt,
      updates,
    });

    const response = await fetch("/api/v1/user/me", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await loadData();
      setStatus("Saved successfully");
      return true;
    }

    const responsePayload = await response.json().catch(() => ({ error: "Failed to save changes" })) as { error?: string };
    if (response.status === 409) {
      await loadData();
    }
    setError(responsePayload.error ?? "Failed to save changes");
    setStatus("Error");
    return false;
  }

  async function saveReroutingData(updates: Partial<UserInfo>) {
    setReroutingDraftState("saving");
    const saved = await saveUserData(updates);
    setReroutingDraftState(saved ? "saved" : "dirty");
    return saved;
  }

  async function saveProfilesData(updates: Partial<UserInfo>) {
    setProfilesDraftState("saving");
    const saved = await saveUserData(updates);
    setProfilesDraftState(saved ? "saved" : "dirty");
    return saved;
  }

  return {
    isCheckingAuth,
    isAuthenticated,
    user,
    setUser,
    keys,
    status,
    setStatus,
    error,
    setError,
    gateways,
    reroutingDraftState,
    profilesDraftState,
    markReroutingDirty,
    markProfilesDirty,
    registrationMode,
    registrationStatus,
    resolveAuth,
    loadData,
    handleLogout,
    saveUserData,
    saveReroutingData,
    saveProfilesData,
  };
}
