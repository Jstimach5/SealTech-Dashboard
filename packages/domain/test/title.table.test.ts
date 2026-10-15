import { describe, expect, it } from 'vitest';
import { PROGRAMS, SCOPES } from '../src/enums.js';
import { makeLabel, parseTitle } from '../src/derive/title.js';
import type { TitleInput, TitleParse } from '../src/derive/title.js';

interface Case {
  name: string;
  input: TitleInput;
  expected: TitleParse;
}

const cases: Case[] = [
  // ----- the six live Jobber titles -----
  {
    name: 'live: KZOO - Consumers Install - Kaplan',
    input: { title: 'KZOO - Consumers Install - Kaplan' },
    expected: { lastName: 'KAPLAN', city: 'KZOO', scope: 'ATT', program: 'CE_INSULATION', label: 'KAPLAN · KZOO · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'live: WARREN - CONSUMERS INSTALL - BROOKS',
    input: { title: 'WARREN - CONSUMERS INSTALL - BROOKS' },
    expected: { lastName: 'BROOKS', city: 'WARREN', scope: 'ATT', program: 'CE_INSULATION', label: 'BROOKS · WARREN · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'live: DETROIT - TRANSCENDING - CLOSED CELL (type last → middle is the name; no token → PROGRAM)',
    input: { title: 'DETROIT - TRANSCENDING - CLOSED CELL' },
    expected: { lastName: 'TRANSCENDING', city: 'DETROIT', scope: 'ATT', program: 'PROGRAM', label: 'TRANSCENDING · DETROIT · ATT', typeWord: 'CLOSED CELL' },
  },
  {
    name: 'live: FLINT - EATON - HVAC REPLACEMENT (type last; HVAC alone → STANDARD)',
    input: { title: 'FLINT - EATON - HVAC REPLACEMENT' },
    expected: { lastName: 'EATON', city: 'FLINT', scope: 'HVAC', program: 'STANDARD', label: 'EATON · FLINT · HVAC', token: 'HVAC', typeWord: 'REPLACEMENT' },
  },
  {
    name: 'live: SAGINAW - REVISIT - WEISS (no token → PROGRAM, REVISIT → ATT)',
    input: { title: 'SAGINAW - REVISIT - WEISS' },
    expected: { lastName: 'WEISS', city: 'SAGINAW', scope: 'ATT', program: 'PROGRAM', label: 'WEISS · SAGINAW · ATT', typeWord: 'REVISIT' },
  },
  {
    name: 'live: Belleville - CONSUMERS HVAC EVAL - Pipeline (EVAL beats HVAC; 10-char city kept)',
    input: { title: 'Belleville - CONSUMERS HVAC EVAL - Pipeline' },
    expected: { lastName: 'PIPELINE', city: 'BELLEVILLE', scope: 'EVAL', program: 'CE_HVAC', label: 'PIPELINE · BELLEVILLE · EVAL', token: 'CONSUMERS HVAC', typeWord: 'EVAL' },
  },

  // ----- tokens -----
  {
    name: 'lowercase token',
    input: { title: 'kzoo - std install - lee' },
    expected: { lastName: 'LEE', city: 'KZOO', scope: 'ATT', program: 'STANDARD', label: 'LEE · KZOO · ATT', token: 'STD', typeWord: 'INSTALL' },
  },
  {
    name: 'TESTVILLE - CONSUMERS INSTALL - ORTIZ',
    input: { title: 'TESTVILLE - CONSUMERS INSTALL - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'ATT', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'KZOO - Consumers Install - Hughes',
    input: { title: 'KZOO - Consumers Install - Hughes' },
    expected: { lastName: 'HUGHES', city: 'KZOO', scope: 'ATT', program: 'CE_INSULATION', label: 'HUGHES · KZOO · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'City - CONSUMERS HVAC EVAL - Last → EVAL CE_HVAC',
    input: { title: 'City - CONSUMERS HVAC EVAL - Last' },
    expected: { lastName: 'LAST', city: 'CITY', scope: 'EVAL', program: 'CE_HVAC', label: 'LAST · CITY · EVAL', token: 'CONSUMERS HVAC', typeWord: 'EVAL' },
  },
  {
    name: 'CE HVAC token with FURNACE → HVAC CE_HVAC',
    input: { title: 'TESTVILLE - CE HVAC FURNACE - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'HVAC', program: 'CE_HVAC', label: 'ORTIZ · TESTVILLE · HVAC', token: 'CE HVAC', typeWord: 'FURNACE' },
  },
  {
    name: 'CE HVAC token with blank type → HVAC from the program',
    input: { title: 'TESTVILLE - CE HVAC - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'HVAC', program: 'CE_HVAC', label: 'ORTIZ · TESTVILLE · HVAC', token: 'CE HVAC' },
  },
  {
    name: 'CEHN token → CE_INSULATION',
    input: { title: 'TESTVILLE - CEHN INSTALL - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'ATT', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · ATT', token: 'CEHN', typeWord: 'INSTALL' },
  },
  {
    name: 'CE INS token with RIM keeps ATT',
    input: { title: 'TESTVILLE - CE INS RIM - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'ATT', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · ATT', token: 'CE INS', typeWord: 'RIM' },
  },
  {
    name: 'HVAC alone (no CONSUMERS) → STANDARD, scope HVAC',
    input: { title: 'TESTVILLE - HVAC INSTALL - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'HVAC', program: 'STANDARD', label: 'ORTIZ · TESTVILLE · HVAC', token: 'HVAC', typeWord: 'INSTALL' },
  },
  {
    name: 'SERVICE token → STANDARD, scope SVC',
    input: { title: 'TESTVILLE - SERVICE CALL - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'SVC', program: 'STANDARD', label: 'ORTIZ · TESTVILLE · SVC', token: 'SERVICE', typeWord: 'CALL' },
  },
  {
    name: 'WARRANTY token with FIX → STANDARD, scope SVC',
    input: { title: 'TESTVILLE - WARRANTY FIX - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'SVC', program: 'STANDARD', label: 'ORTIZ · TESTVILLE · SVC', token: 'WARRANTY', typeWord: 'FIX' },
  },
  {
    name: 'token with blank type → ATT, no typeWord',
    input: { title: 'TESTVILLE - CONSUMERS - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'ATT', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · ATT', token: 'CONSUMERS' },
  },
  {
    name: 'negative: token glued into a longer word does not count → PROGRAM',
    input: { title: 'TESTVILLE - STDX INSTALL - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'ATT', program: 'PROGRAM', label: 'ORTIZ · TESTVILLE · ATT', typeWord: 'STDX INSTALL' },
  },
  {
    name: 'negative: REPAIR is not a Standard token → PROGRAM, scope SVC',
    input: { title: 'TRENTON - JUSTIN BISE(old job) REPAIR - ACHRAM' },
    expected: { lastName: 'ACHRAM', city: 'TRENTON', scope: 'SVC', program: 'PROGRAM', label: 'ACHRAM · TRENTON · SVC', typeWord: 'JUSTIN BISE OLD JOB REPAIR' },
  },
  {
    name: 'negative: no token anywhere → PROGRAM, scope —',
    input: { title: 'JACK LOOK AT ME W/ JAMIE', clientName: 'Jamie Jones', propertyCity: 'Testville' },
    expected: { lastName: 'JONES', city: 'TESTVILLE', scope: '—', program: 'PROGRAM', label: 'JONES · TESTVILLE · —', typeWord: 'JACK LOOK AT ME W JAMIE' },
  },

  // ----- scope -----
  {
    name: 'STD INSTALL with instructions "air seal attic" → AIR STANDARD',
    input: { title: 'TESTVILLE - STD INSTALL - BELL', instructions: 'air seal attic' },
    expected: { lastName: 'BELL', city: 'TESTVILLE', scope: 'AIR', program: 'STANDARD', label: 'BELL · TESTVILLE · AIR', token: 'STD', typeWord: 'INSTALL' },
  },
  {
    name: 'AIR-SEAL with a hyphen in the title → AIR',
    input: { title: 'TESTVILLE - CONSUMERS AIR-SEAL - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'AIR', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · AIR', token: 'CONSUMERS', typeWord: 'AIR SEAL' },
  },
  {
    name: 'WALLS in the title → WALL',
    input: { title: 'TESTVILLE - CONSUMERS WALLS - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'WALL', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · WALL', token: 'CONSUMERS', typeWord: 'WALLS' },
  },
  {
    name: 'WALL mentioned only in instructions → WALL',
    input: { title: 'TESTVILLE - CONSUMERS INSTALL - ORTIZ', instructions: 'Walls today, then attic' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'WALL', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · WALL', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'BD word → BD',
    input: { title: 'TESTVILLE - STD BD - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'BD', program: 'STANDARD', label: 'ORTIZ · TESTVILLE · BD', token: 'STD', typeWord: 'BD' },
  },
  {
    name: 'BLOWER DOOR → BD',
    input: { title: 'TESTVILLE - CONSUMERS BLOWER DOOR - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'BD', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · BD', token: 'CONSUMERS', typeWord: 'BLOWER DOOR' },
  },
  {
    name: 'ESTIMATE beats FURNACE → EVAL',
    input: { title: 'TESTVILLE - STD FURNACE ESTIMATE - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'EVAL', program: 'STANDARD', label: 'ORTIZ · TESTVILLE · EVAL', token: 'STD', typeWord: 'FURNACE ESTIMATE' },
  },
  {
    name: 'SPRAY FOAM keeps ATT',
    input: { title: 'TESTVILLE - STD SPRAY FOAM - ORTIZ' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'ATT', program: 'STANDARD', label: 'ORTIZ · TESTVILLE · ATT', token: 'STD', typeWord: 'SPRAY FOAM' },
  },
  {
    name: 'negative: instructions cannot turn an install into HVAC (only WALL / AIR / BD refine)',
    input: { title: 'TESTVILLE - CONSUMERS INSTALL - ORTIZ', instructions: 'furnace in basement' },
    expected: { lastName: 'ORTIZ', city: 'TESTVILLE', scope: 'ATT', program: 'CE_INSULATION', label: 'ORTIZ · TESTVILLE · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'negative: a last name that is a scope word (WALLS) is not a scope',
    input: { title: 'TESTVILLE - CONSUMERS INSTALL - WALLS' },
    expected: { lastName: 'WALLS', city: 'TESTVILLE', scope: 'ATT', program: 'CE_INSULATION', label: 'WALLS · TESTVILLE · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'negative: nothing recognisable → —',
    input: { title: 'Pole barn', clientName: 'DANNY  BERGMOSER', propertyCity: 'Frenchtown Township' },
    expected: { lastName: 'BERGMOSER', city: 'FRENCHTOW.', scope: '—', program: 'PROGRAM', label: 'BERGMOSER · FRENCHTOW. · —', typeWord: 'POLE BARN' },
  },

  // ----- part counts, separators, fallbacks -----
  {
    name: 'en dash separator',
    input: { title: 'KZOO – CONSUMERS INSTALL – KAPLAN' },
    expected: { lastName: 'KAPLAN', city: 'KZOO', scope: 'ATT', program: 'CE_INSULATION', label: 'KAPLAN · KZOO · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'em dash separator',
    input: { title: 'KZOO — STD INSTALL — KAPLAN' },
    expected: { lastName: 'KAPLAN', city: 'KZOO', scope: 'ATT', program: 'STANDARD', label: 'KAPLAN · KZOO · ATT', token: 'STD', typeWord: 'INSTALL' },
  },
  {
    name: 'four parts: middle parts join into the type text',
    input: { title: 'KZOO - CONSUMERS - INSTALL - KAPLAN' },
    expected: { lastName: 'KAPLAN', city: 'KZOO', scope: 'ATT', program: 'CE_INSULATION', label: 'KAPLAN · KZOO · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'two parts: last name from clientName',
    input: { title: 'KZOO - CONSUMERS INSTALL', clientName: 'Jo Kaplan' },
    expected: { lastName: 'KAPLAN', city: 'KZOO', scope: 'ATT', program: 'CE_INSULATION', label: 'KAPLAN · KZOO · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'negative: two parts without clientName → blank name shows as —',
    input: { title: 'KZOO - STD INSTALL' },
    expected: { lastName: '', city: 'KZOO', scope: 'ATT', program: 'STANDARD', label: '— · KZOO · ATT', token: 'STD', typeWord: 'INSTALL' },
  },
  {
    name: 'negative: two parts with no token stays fail-closed',
    input: { title: 'KZOO - Kaplan', clientName: 'Jo Kaplan' },
    expected: { lastName: 'KAPLAN', city: 'KZOO', scope: '—', program: 'PROGRAM', label: 'KAPLAN · KZOO · —', typeWord: 'KAPLAN' },
  },
  {
    name: 'one part with a token: city and name from property and client',
    input: { title: 'Consumers install', clientName: 'Jo Kaplan', propertyCity: 'Kalamazoo' },
    expected: { lastName: 'KAPLAN', city: 'KALAMAZOO', scope: 'ATT', program: 'CE_INSULATION', label: 'KAPLAN · KALAMAZOO · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'negative: empty title with clientName only',
    input: { title: '', clientName: 'Sam Rivera' },
    expected: { lastName: 'RIVERA', city: '', scope: '—', program: 'PROGRAM', label: 'RIVERA · — · —' },
  },
  {
    name: 'negative: null title',
    input: { title: null, clientName: 'Ana Costa', propertyCity: 'Monroe' },
    expected: { lastName: 'COSTA', city: 'MONROE', scope: '—', program: 'PROGRAM', label: 'COSTA · MONROE · —' },
  },
  {
    name: 'negative: undefined title and nothing else',
    input: { title: undefined },
    expected: { lastName: '', city: '', scope: '—', program: 'PROGRAM', label: '— · — · —' },
  },

  // ----- name and city shaping -----
  {
    name: "apostrophe in the title's last part → O'BRIEN",
    input: { title: "TESTVILLE - CONSUMERS INSTALL - O'Brien" },
    expected: { lastName: "O'BRIEN", city: 'TESTVILLE', scope: 'ATT', program: 'CE_INSULATION', label: "O'BRIEN · TESTVILLE · ATT", token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'apostrophe via clientName (curly quote straightened), 1-part title',
    input: { title: 'Attic', clientName: 'Mary O’Brien', propertyCity: 'Testville' },
    expected: { lastName: "O'BRIEN", city: 'TESTVILLE', scope: 'ATT', program: 'PROGRAM', label: "O'BRIEN · TESTVILLE · ATT", typeWord: 'ATTIC' },
  },
  {
    name: 'clientName with trailing punctuation keeps letters, hyphen and apostrophe only',
    input: { title: '', clientName: 'Lee Smith-Jones,' },
    expected: { lastName: 'SMITH-JONES', city: '', scope: '—', program: 'PROGRAM', label: 'SMITH-JONES · — · —' },
  },
  {
    name: '12-char city truncates to 9 + "."',
    input: { title: 'Grand Rapids - CONSUMERS INSTALL - SMITH' },
    expected: { lastName: 'SMITH', city: 'GRAND RAP.', scope: 'ATT', program: 'CE_INSULATION', label: 'SMITH · GRAND RAP. · ATT', token: 'CONSUMERS', typeWord: 'INSTALL' },
  },
  {
    name: 'city cut on a space drops the trailing space before "."',
    input: { title: 'Sterling Heights - STD INSTALL - LEE' },
    expected: { lastName: 'LEE', city: 'STERLING.', scope: 'ATT', program: 'STANDARD', label: 'LEE · STERLING. · ATT', token: 'STD', typeWord: 'INSTALL' },
  },
];

describe('parseTitle', () => {
  it.each(cases)('$name', ({ input, expected }) => {
    expect(parseTitle(input)).toEqual(expected);
  });

  it('every label is LASTNAME · CITY · SCOPE with house vocabulary and no dollars or digits (decision 4)', () => {
    for (const c of cases) {
      const out = parseTitle(c.input);
      expect(out.label).toBe(`${out.lastName || '—'} · ${out.city || '—'} · ${out.scope}`);
      expect(out.label).not.toMatch(/[$\d]/);
      expect(SCOPES).toContain(out.scope);
      expect(PROGRAMS).toContain(out.program);
    }
  });
});

describe('makeLabel', () => {
  it.each([
    { name: 'uppercases and shortens the city', args: ['smith', 'frenchtown township', 'ATT'], expected: 'SMITH · FRENCHTOW. · ATT' },
    { name: 'blank parts show as —', args: ['', '', '—'], expected: '— · — · —' },
    { name: 'straightens a curly apostrophe', args: ['O’Brien', 'Kzoo', 'BD'], expected: "O'BRIEN · KZOO · BD" },
    { name: 'uses the middle dot with spaces', args: ['ORTIZ', 'TESTVILLE', 'EVAL'], expected: 'ORTIZ · TESTVILLE · EVAL' },
  ] as const)('$name', ({ args, expected }) => {
    expect(makeLabel(args[0], args[1], args[2])).toBe(expected);
  });
});
