"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { apiFetch } from "@/lib/api";

type SourceStatusItem = {
 source_name: string;
 mode: string;
};

type SourceStatusResponse = {
 items: SourceStatusItem[];
};

const CACHE_KEY = "fixture-mode-status-cache";
const CACHE_TTL_MS = 30_000;
const CRITICAL_SOURCES = new Set([
 "franklin_auditor",
 "columbus_arcgis_permits",
 "fema_nfhl",
 "osm_overpass",
 "cota_gtfs",
]);

export function FixtureModeBanner() {
 const { data: session } = useSession();
 const [items, setItems] = useState([] as SourceStatusItem[]);
 const [warning, setWarning] = useState("");
 const devMode = process.env.NODE_ENV !== "production";

 useEffect(function () {
 const cached = typeof window !== "undefined" ? window.sessionStorage.getItem(CACHE_KEY) : null;
 if (!cached) {
 return;
 }
 try {
 const payload = JSON.parse(cached) as { timestamp: number; items: SourceStatusItem[] };
 if (Date.now() - payload.timestamp <= CACHE_TTL_MS) {
 setItems(payload.items);
 }
 } catch (error) {
 if (devMode) {
 console.warn("fixture mode cache parse failed", error);
 setWarning("Fixture status cache parse failed.");
 }
 }
 }, [devMode]);

 useEffect(function () {
 if (!session) {
 return;
 }
 let active = true;

 const load = async function () {
 try {
 const response = await apiFetch<SourceStatusResponse>("/sources/status", session?.apiToken);
 if (!active) {
 return;
 }
 const nextItems = response.items ?? [];
 setItems(nextItems);
 setWarning("");
 if (typeof window !== "undefined") {
 window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), items: nextItems }));
 }
 } catch (error) {
 if (devMode) {
 console.warn("fixture mode status fetch failed", error);
 setWarning("Fixture status refresh failed.");
 }
 }
 };

 void load();
 const timer = window.setInterval(function () {
 void load();
 }, CACHE_TTL_MS);

 return function () {
 active = false;
 window.clearInterval(timer);
 };
 }, [session, devMode]);

 const fixtureEnabled = useMemo(function () {
 return items.some(function (item) {
 if (!CRITICAL_SOURCES.has(item.source_name)) {
 return false;
 }
 return item.mode === "fixture";
 });
 }, [items]);

 if (!fixtureEnabled) {
 if (!warning) {
 return null;
 }
 }

 const message = fixtureEnabled
 ? "Fixture mode: demo data in use. Live sources not connected."
 : warning;

 return (
 <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-200/10 px-3 py-2 text-sm text-amber-100">
 {message}
 </div>
 );
}


