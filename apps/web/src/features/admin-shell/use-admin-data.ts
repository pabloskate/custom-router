"use client";

import { useEffect, useState } from "react";

import type { RegistrationMode } from "@/src/lib/constants";
import { hydrateUser, type ServerUserInfo, type UserInfo } from "@/src/features/account-settings/contracts";
import type { GatewaySummary } from "@/src/features/gateways/contracts";
import type { ApiKeyInfo, RoutingDraftState } from "@/src/components/admin/types";

export function useAdminData() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | undefined>();
  const [gatewayModelOptions, setGatewayModelOptions] = useState<string[]>([]);
  const [routingDraftState, setRoutingDraftState] = useState<RoutingDraftState>("pristine");
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("closed");

  async function loadData() {
    setStatus("Loading...");
    setError(undefined);

    const [userRes, keysRes, gatewaysRes, registrationRes] = await Promise.all([
      fetch("/api/v1/user/me", { cache: "no-store" }),
      fetch("/api/v1/user/keys", { cache: "no-store" }),
      fetch("/api/v1/user/gateways", { cache: "no-store" }),
      fetch("/api/v1/auth/registration-status", { cache: "no-store" }),
    ]);

    if (!userRes.ok) {
      setIsAuthenticated(false);
      setUser(null);
      setKeys([]);
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
      const gatewaysData = await gatewaysRes.json() as { gateways?: GatewaySummary[] };
      const modelIds = Array.from(
        new Set(
          (gatewaysData.gateways ?? [])
            .flatMap((gateway) => gateway.models.map((model) => model.id))
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right));
      setGatewayModelOptions(modelIds);
    } else {
      setGatewayModelOptions([]);
    }

    if (registrationRes.ok) {
      const registrationData = await registrationRes.json() as { mode: RegistrationMode };
      setRegistrationMode(registrationData.mode);
    } else {
      setRegistrationMode("closed");
    }

    setUser(hydrateUser(userData.user));
    setKeys(keysData.keys);
    setIsAuthenticated(true);
    setRoutingDraftState("pristine");
    setStatus("Ready");
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleLogout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    setIsAuthenticated(false);
    setUser(null);
    setKeys([]);
    setRoutingDraftState("pristine");
    setStatus("Logged out");
  }

  function markRoutingDirty() {
    setRoutingDraftState((current) => (current === "dirty" ? current : "dirty"));
  }

  async function saveUserData(updates: Partial<UserInfo>) {
    if (!user) {
      return false;
    }

    setStatus("Saving...");
    setError(undefined);

    const updatedUser = { ...user, ...updates };
    const payload: Record<string, unknown> = {
      preferred_models: updatedUser.preferredModels,
      default_model: updatedUser.defaultModel,
      classifier_model: updatedUser.classifierModel,
      blocklist: updatedUser.blocklist,
      custom_catalog: updatedUser.customCatalog,
      profiles: updatedUser.profiles,
      route_trigger_keywords: updatedUser.routeTriggerKeywords,
      routing_frequency: updatedUser.routingFrequency,
      smart_pin_turns: updatedUser.smartPinTurns,
    };

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

    setError("Failed to save changes");
    setStatus("Error");
    return false;
  }

  async function saveRoutingData(updates: Partial<UserInfo>) {
    setRoutingDraftState("saving");
    const saved = await saveUserData(updates);
    setRoutingDraftState(saved ? "saved" : "dirty");
    return saved;
  }

  return {
    isAuthenticated,
    user,
    setUser,
    keys,
    status,
    setStatus,
    error,
    setError,
    gatewayModelOptions,
    routingDraftState,
    markRoutingDirty,
    registrationMode,
    loadData,
    handleLogout,
    saveUserData,
    saveRoutingData,
  };
}
