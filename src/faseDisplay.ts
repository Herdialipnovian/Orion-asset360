/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Display numbering for the asset lifecycle. Internal stages run 3–10 (Fase 1 Request & 2 Produksi
 * were removed — assets are born in Gudang). For the operator the phases are numbered 1–8, so the
 * visible number is the internal stage minus 2. Logic/DB/server keep the internal 3–10 values.
 */
export const FASE_OFFSET = 2;
export const TOTAL_FASE = 8;
export const faseNo = (stage: number): number => stage - FASE_OFFSET;
