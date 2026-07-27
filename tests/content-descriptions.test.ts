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
      "wind-blast": "2회 · 사거리 3.5칸 · 첫 적을 강하게 밀고 0.5초 휘청",
      "brick-bag": "4회 · 2칸 안의 지정 타일 · 이동·넉백 차단 벽 · 설치할 때 체력 20 회복",
      boat: "1회 · 3초간 물 위 이동 · 탑승 중 스킬·아이템 사용 불가 · 체력·마나 재생 중지",
      bomb: "2회 · 지정 타일 · 3.5초 뒤 반경 3칸 80 피해 · 설치자는 피해 없음",
      soap: "4회 · 3칸 안의 지정 타일 · 1초 미끄러짐 · 설치자는 미끄러지지 않음",
    } as const;

    for (const definitionId of ITEM_DEFINITION_IDS) {
      expect(formatItemDescription(getItemDefinition(definitionId))).toBe(expected[definitionId]);
    }
  });

  it("reflects changed values and omits zero-valued fields", () => {
    const windBlast = getItemDefinition("wind-blast");
    expect(formatItemDescription({ ...windBlast, startingCharges: 3, castRange: 6.5 })).toContain(
      "3회 · 사거리 6.5칸",
    );
    expect(formatItemDescription({ ...windBlast, startingCharges: 0, castRange: 0 })).not.toMatch(
      /0(?:회|칸)/u,
    );
  });

  it("separates card metadata from the effect copy without duplicating charges", () => {
    const windBlast = getItemDefinition("wind-blast");
    expect(formatItemDescription(windBlast)).toMatch(/^2회 · /u);
    expect(formatItemEffectDescription(windBlast)).toBe(
      "사거리 3.5칸 · 첫 적을 강하게 밀고 0.5초 휘청",
    );
    expect(formatItemEffectDescription(windBlast)).not.toContain("2회");
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
