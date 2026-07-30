import { describe, expect, it } from "vitest";
import {
  formatItemDescription,
  formatItemEffectDescription,
  getItemDefinition,
  isActiveItemDefinitionId,
  isItemDefinitionId,
  ITEM_DEFINITION_IDS,
} from "../src/content/items";

describe("content description SSOT", () => {
  it("derives every item description from its definition", () => {
    const expected = {
      "iron-boots": "8초간 몸무게 +10%, 회피 -38%",
      feather: "8초간 몸무게 -15%, 회피 +45%",
      "spring-glove": "다음 갈고리 속도 +45%, 사거리 +25%",
      soap: "4회 · 내 위치에서 최대 3칸 떨어진 곳에 비누 설치 · 밟은 상대는 2초 동안 미끄러짐 · 미끄러짐이 끝나면 피해 25 · 내가 설치한 비누에는 미끄러지지 않음",
      "brick-bag":
        "4회 · 내 위치에서 최대 2칸 떨어진 곳에 벽 설치 · 벽은 이동과 넉백을 막음 · 설치할 때 체력 7 회복",
      boat: "1회 · 물에 들어가면 자동 탑승 · 2.5초간 물 위 이동 · 육지 사용 불가 · 탑승 중 스킬·아이템 사용 불가 · 체력·마나 재생 중지",
      bomb: "2회 · 내 위치에서 최대 0.75칸 떨어진 곳에 폭탄 설치 · 3.25초 뒤 폭발 · 폭발 반경 3칸 · 피해 65 · 나는 폭발 피해를 받지 않음",
    } as const;

    for (const definitionId of ITEM_DEFINITION_IDS) {
      expect(formatItemDescription(getItemDefinition(definitionId))).toBe(expected[definitionId]);
    }
  });

  it("reflects changed values and omits zero-valued fields", () => {
    const soap = getItemDefinition("soap");
    expect(formatItemDescription({ ...soap, startingCharges: 3, castRange: 6.5 })).toContain(
      "3회 · 내 위치에서 최대 6.5칸 떨어진 곳에 비누 설치",
    );
    expect(formatItemDescription({ ...soap, startingCharges: 0, castRange: 0 })).not.toMatch(
      /0(?:회|칸)/u,
    );
  });

  it("separates card metadata from the effect copy without duplicating charges", () => {
    const soap = getItemDefinition("soap");
    expect(formatItemDescription(soap)).toMatch(/^4회 · /u);
    expect(formatItemEffectDescription(soap)).toBe(
      "내 위치에서 최대 3칸 떨어진 곳에 비누 설치 · 밟은 상대는 2초 동안 미끄러짐 · 미끄러짐이 끝나면 피해 25 · 내가 설치한 비누에는 미끄러지지 않음",
    );
    expect(formatItemEffectDescription(soap)).not.toContain("4회");
  });

  it("keeps item identity, labels, and active eligibility in the definition registry", () => {
    const labels = ITEM_DEFINITION_IDS.map((definitionId) => getItemDefinition(definitionId).label);
    expect(new Set(labels).size).toBe(ITEM_DEFINITION_IDS.length);
    expect(isItemDefinitionId("bomb")).toBe(true);
    expect(isItemDefinitionId("grappling-hook")).toBe(false);
    expect(isActiveItemDefinitionId("bomb")).toBe(true);
    expect(isActiveItemDefinitionId("iron-boots")).toBe(false);
  });
});
