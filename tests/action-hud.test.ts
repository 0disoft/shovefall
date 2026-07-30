import { describe, expect, it } from "vitest";
import {
  createGrappleButtonViewModel,
  createItemButtonViewModel,
  createSkillButtonViewModel,
  type ActionHudContext,
} from "../src/app/action-hud";
import { normalizeGameConfig, type RenderParticipantV1 } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const ACTIVE_CONTEXT: ActionHudContext = Object.freeze({
  tick: 0,
  countdownActive: false,
  roundActive: true,
});

function createHuman(): RenderParticipantV1 {
  const world = new SimulationWorld(
    normalizeGameConfig({ participantCount: 4, roundLimitSeconds: 10 }),
    "action-hud",
    {
      humanActorId: 1,
      participantOverrides: [
        {
          actorId: 1,
          startingItems: ["bomb"],
          startingSkills: ["arc-bolt", "blink-step"],
        },
      ],
    },
  );
  const human = world.createRenderFrame().participants.find(({ actorId }) => actorId === 1);
  if (human === undefined) {
    throw new Error("human fixture is missing");
  }
  return human;
}

describe("action HUD view models", () => {
  it("renders built-in grapple readiness and cooldown from one rule", () => {
    const human = createHuman();
    expect(createGrappleButtonViewModel(human, ACTIVE_CONTEXT)).toEqual({
      state: "ready",
      text: "E · 구조 갈고리 · 준비 · 재사용 10.5초",
      disabled: false,
      ariaLabel: "구조 갈고리, 사용 가능, 재사용 대기시간 10.5초",
    });
    expect(
      createGrappleButtonViewModel(
        Object.freeze({ ...human, grappleReadyTick: 300 }),
        ACTIVE_CONTEXT,
      ),
    ).toEqual({
      state: "cooldown",
      text: "E · 구조 갈고리 · 5.0초",
      disabled: true,
      ariaLabel: "구조 갈고리, 재사용까지 5.0초",
    });
  });

  it("renders skill mana, cooldown, and blocked states without touching the DOM", () => {
    const human = createHuman();
    expect(createSkillButtonViewModel(human, 0, ACTIVE_CONTEXT)).toMatchObject({
      state: "ready",
      text: "Q · 파동탄 · 30MP",
      disabled: false,
    });
    const noMana = Object.freeze({
      ...human,
      combat: Object.freeze({ ...human.combat, mana: 0 }),
    });
    expect(createSkillButtonViewModel(noMana, 0, ACTIVE_CONTEXT)).toMatchObject({
      state: "mana",
      text: "Q · 파동탄 · 30MP 필요",
      disabled: true,
      rejectionMessage: "마나가 부족해. 30MP가 필요해.",
    });
    expect(
      createSkillButtonViewModel(
        Object.freeze({
          ...human,
          skills: Object.freeze(
            human.skills.map((slot) =>
              slot.slotIndex === 0 ? Object.freeze({ ...slot, readyTick: 180 }) : slot,
            ),
          ),
        }),
        0,
        ACTIVE_CONTEXT,
      ),
    ).toMatchObject({
      state: "cooldown",
      text: "Q · 파동탄 · 3.0초",
      disabled: true,
      rejectionMessage: "재사용 대기시간 중이야. 3.0초 남았어.",
    });
    const agilityFocused = Object.freeze({
      ...human,
      startingAttributes: Object.freeze({
        strength: 0,
        agility: 20,
        constitution: 0,
        spirit: 0,
        balance: 0,
        willpower: 0,
      }),
    });
    expect(createSkillButtonViewModel(agilityFocused, 0, ACTIVE_CONTEXT)).toMatchObject({
      state: "ready",
      text: "Q · 파동탄 · 21MP",
      disabled: false,
    });
  });

  it("uses item labels and active/passive eligibility from the item SSOT", () => {
    const human = createHuman();
    expect(createItemButtonViewModel(human, 0, ACTIVE_CONTEXT)).toEqual({
      state: "ready",
      text: "D · 시한폭탄 · 2회",
      ariaLabel: "시한폭탄 사용, 2회 남음",
      disabled: false,
    });
    expect(
      createItemButtonViewModel(human, 0, { ...ACTIVE_CONTEXT, countdownActive: true }),
    ).toMatchObject({ state: "blocked", disabled: true });
  });
});
