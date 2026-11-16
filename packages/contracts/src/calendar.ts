import { isRecord } from './index.ts';
import { hasExactFields, isIsoDate, isStockId, isText } from './stock.ts';
export const mealTypes = ['CAFE_MANHA', 'ALMOCO', 'JANTAR'] as const;
export type MealType = typeof mealTypes[number];
export interface CalendarMeal { tipo: MealType; inicio: string; fim: string; capacidade: number | null }
export interface CalendarException { data: string; tipo: 'FERIADO' | 'FECHADO' | 'ESPECIAL'; descricao: string; refeicoes: CalendarMeal[] }
export interface CalendarInput { dias_semana: number[]; atende_feriados: boolean; refeicoes: CalendarMeal[]; excecoes: CalendarException[] }
export interface CalendarConfig extends CalendarInput { unidade_id: string; revisao: string }
export interface CalendarSave extends CalendarInput { revisao: string | null; motivo: string }
export interface CalendarSnapshot { unidade: { id: string; codigo: string; nome: string }; calendario: CalendarConfig | null; pode_editar: boolean }
export interface CalendarDay { data: string; revisao: string | null; origem: 'NAO_CONFIGURADO' | 'ROTINA' | 'FERIADO' | 'FECHADO' | 'ESPECIAL'; aberto: boolean; refeicoes: CalendarMeal[] }
export const calendarFields = ['dias_semana', 'atende_feriados', 'refeicoes', 'excecoes'] as const;
const validTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function isCalendarMeal(v: unknown): v is CalendarMeal {
  return isRecord(v) && hasExactFields(v, ['tipo', 'inicio', 'fim', 'capacidade']) && mealTypes.some(t => t === v.tipo)
    && validTime(v.inicio) && validTime(v.fim) && v.inicio < v.fim
    && (v.capacidade === null || (typeof v.capacidade === 'number' && Number.isInteger(v.capacidade) && v.capacidade > 0 && v.capacidade <= 2147483647));
}
function meals(v: unknown): v is CalendarMeal[] { return Array.isArray(v) && v.length <= 3 && v.every(isCalendarMeal) && new Set(v.map(m => m.tipo)).size === v.length; }
function exception(v: unknown): v is CalendarException {
  return isRecord(v) && hasExactFields(v, ['data', 'tipo', 'descricao', 'refeicoes']) && isIsoDate(v.data)
    && (v.tipo === 'FERIADO' || v.tipo === 'FECHADO' || v.tipo === 'ESPECIAL') && isText(v.descricao, 200)
    && meals(v.refeicoes) && (v.tipo === 'ESPECIAL' ? v.refeicoes.length > 0 : v.refeicoes.length === 0);
}
export function isCalendarInput(v: unknown): v is CalendarInput {
  return isRecord(v) && hasExactFields(v, calendarFields) && Array.isArray(v.dias_semana) && v.dias_semana.length <= 7
    && v.dias_semana.every(d => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(v.dias_semana).size === v.dias_semana.length
    && typeof v.atende_feriados === 'boolean' && meals(v.refeicoes) && Array.isArray(v.excecoes) && v.excecoes.length <= 200
    && v.excecoes.every(exception) && new Set(v.excecoes.map(e => e.data)).size === v.excecoes.length;
}
export function calendarInput(v: CalendarInput): CalendarInput {
  return { dias_semana: [...v.dias_semana], atende_feriados: v.atende_feriados,
    refeicoes: v.refeicoes.map(m => ({ tipo: m.tipo, inicio: m.inicio, fim: m.fim, capacidade: m.capacidade })),
    excecoes: v.excecoes.map(e => ({ data: e.data, tipo: e.tipo, descricao: e.descricao, refeicoes: e.refeicoes.map(m => ({ tipo: m.tipo, inicio: m.inicio, fim: m.fim, capacidade: m.capacidade })) })) };
}
export function isCalendarSave(v: unknown): v is CalendarSave {
  if (!isRecord(v) || !hasExactFields(v, [...calendarFields, 'revisao', 'motivo'])) return false;
  const { revisao, motivo, ...input } = v;
  return (revisao === null || isStockId(revisao)) && isText(motivo, 500) && motivo.trim().length >= 3 && isCalendarInput(input);
}
export function isCalendarSnapshot(v: unknown, unit: string): v is CalendarSnapshot {
  if (!isRecord(v) || !isRecord(v.unidade) || v.unidade.id !== unit || !isText(v.unidade.codigo, 200) || !isText(v.unidade.nome, 500) || typeof v.pode_editar !== 'boolean') return false;
  if (v.calendario === null) return true;
  if (!isRecord(v.calendario) || v.calendario.unidade_id !== unit || !isStockId(v.calendario.revisao)) return false;
  if (!hasExactFields(v.calendario, [...calendarFields, 'unidade_id', 'revisao'])) return false;
  const config = v.calendario;
  const input = Object.fromEntries(calendarFields.map(key => [key, config[key]]));
  return isCalendarInput(input);
}
/** Current configuration only; an explicit date exception takes precedence over the weekly schedule. */
export function resolveCalendar(config: CalendarConfig | null, date: string): CalendarDay {
  if (!isIsoDate(date)) throw new Error('Data inválida.');
  if (!config) return { data: date, revisao: null, origem: 'NAO_CONFIGURADO', aberto: false, refeicoes: [] };
  const e = config.excecoes.find(e => e.data === date), day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const source = e?.tipo ?? 'ROTINA';
  const list = e?.tipo === 'ESPECIAL' ? e.refeicoes : e?.tipo === 'FECHADO' || !config.dias_semana.includes(day) || (e?.tipo === 'FERIADO' && !config.atende_feriados) ? [] : config.refeicoes;
  return { data: date, revisao: config.revisao, origem: source, aberto: list.length > 0, refeicoes: list.map(m => ({ ...m })) };
}
export function calendarTemplate(kind: 'RP1' | 'RP2'): CalendarInput {
  return { dias_semana: kind === 'RP1' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5], atende_feriados: kind === 'RP1', excecoes: [],
    refeicoes: kind === 'RP1' ? [{ tipo: 'CAFE_MANHA', inicio: '07:00', fim: '09:00', capacidade: null }, { tipo: 'ALMOCO', inicio: '11:00', fim: '14:00', capacidade: null }, { tipo: 'JANTAR', inicio: '17:00', fim: '19:00', capacidade: null }] : [{ tipo: 'ALMOCO', inicio: '11:00', fim: '14:00', capacidade: null }] };
}
