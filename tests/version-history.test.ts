import { describe, expect, it } from "vitest";
import { VERSION_HISTORY } from "../src/app/version-history";
import { PRODUCT_VERSION } from "../src/simulation/versions";

describe("version history", () => {
  it("keeps the current product version first and records concise reasons and changes", () => {
    expect(VERSION_HISTORY[0]?.version).toBe(PRODUCT_VERSION);
    expect(VERSION_HISTORY[0]).toMatchObject({
      version: "0.199.29",
      title: expect.stringContaining("한 장"),
      change: expect.stringContaining("조작법"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.28")).toMatchObject({
      version: "0.199.28",
      title: expect.stringContaining("한 장"),
      change: expect.stringContaining("세 칸"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.27")).toMatchObject({
      version: "0.199.27",
      title: expect.stringContaining("일시정지"),
      change: expect.stringContaining("8픽셀"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.26")).toMatchObject({
      version: "0.199.26",
      title: expect.stringContaining("절반"),
      change: expect.stringContaining("279"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.25")).toMatchObject({
      version: "0.199.25",
      title: expect.stringContaining("한눈에"),
      change: expect.stringContaining("한 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.24")).toMatchObject({
      version: "0.199.24",
      title: expect.stringContaining("통계"),
      change: expect.stringContaining("일찍"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.23")).toMatchObject({
      version: "0.199.23",
      title: expect.stringContaining("일시정지"),
      change: expect.stringContaining("붙지 않게"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.22")).toMatchObject({
      version: "0.199.22",
      title: expect.stringContaining("한 줄"),
      change: expect.stringContaining("두 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.21")).toMatchObject({
      version: "0.199.21",
      title: expect.stringContaining("전투 수치"),
      change: expect.stringContaining("한 장"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.20")).toMatchObject({
      version: "0.199.20",
      title: expect.stringContaining("특성"),
      change: expect.stringContaining("한눈에"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.19")).toMatchObject({
      version: "0.199.19",
      title: expect.stringContaining("일시정지"),
      change: expect.stringContaining("스크롤"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.18")).toMatchObject({
      version: "0.199.18",
      title: expect.stringContaining("카드"),
      change: expect.stringContaining("두 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.17")).toMatchObject({
      version: "0.199.17",
      title: expect.stringContaining("전투 수치"),
      change: expect.stringContaining("숫자만"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.16")).toMatchObject({
      version: "0.199.16",
      title: expect.stringContaining("통계"),
      change: expect.stringContaining("한눈에"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.15")).toMatchObject({
      version: "0.199.15",
      title: expect.stringContaining("일시정지"),
      change: expect.stringContaining("구석"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.14")).toMatchObject({
      version: "0.199.14",
      title: expect.stringContaining("두 줄"),
      change: expect.stringContaining("40%"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.13")).toMatchObject({
      version: "0.199.13",
      title: expect.stringContaining("카드"),
      change: expect.stringContaining("압축"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.12")).toMatchObject({
      version: "0.199.12",
      title: expect.stringContaining("특성"),
      change: expect.stringContaining("5씩"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.11")).toMatchObject({
      version: "0.199.11",
      title: expect.stringContaining("전투 수치"),
      change: expect.stringContaining("한 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.10")).toMatchObject({
      version: "0.199.10",
      title: expect.stringContaining("조작"),
      change: expect.stringContaining("두 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.9")).toMatchObject({
      version: "0.199.9",
      title: expect.stringContaining("큰 글씨"),
      change: expect.stringContaining("한 화면"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.8")).toMatchObject({
      version: "0.199.8",
      title: expect.stringContaining("태블릿"),
      change: expect.stringContaining("두 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.7")).toMatchObject({
      version: "0.199.7",
      title: expect.stringContaining("소리"),
      change: expect.stringContaining("터치 영역"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.6")).toMatchObject({
      version: "0.199.6",
      title: expect.stringContaining("전투 수치"),
      change: expect.stringContaining("네 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.5")).toMatchObject({
      version: "0.199.5",
      title: expect.stringContaining("메뉴"),
      change: expect.stringContaining("한 화면"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.4")).toMatchObject({
      version: "0.199.4",
      title: expect.stringContaining("설정"),
      change: expect.stringContaining("따라다니"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.3")).toMatchObject({
      version: "0.199.3",
      title: expect.stringContaining("브리핑"),
      change: expect.stringContaining("한 화면"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.2")).toMatchObject({
      version: "0.199.2",
      title: expect.stringContaining("가로"),
      change: expect.stringContaining("세 줄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.1")).toMatchObject({
      version: "0.199.1",
      title: expect.stringContaining("일시정지"),
      change: expect.stringContaining("조작법"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.199.0")).toMatchObject({
      version: "0.199.0",
      title: expect.stringContaining("손가락"),
      change: expect.stringContaining("특성"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.198.1")).toMatchObject({
      version: "0.198.1",
      title: expect.stringContaining("탭"),
      change: expect.stringContaining("파비콘"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.41.0")).toMatchObject({
      version: "0.41.0",
      title: expect.stringContaining("점수표"),
      change: expect.stringContaining("순위"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.40.0")).toMatchObject({
      version: "0.40.0",
      title: expect.stringContaining("섬"),
      change: expect.stringContaining("나무"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.39.1")).toMatchObject({
      version: "0.39.1",
      title: expect.stringContaining("출발"),
      change: expect.stringContaining("이동키"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.39.0")).toMatchObject({
      version: "0.39.0",
      title: expect.stringContaining("섬"),
      change: expect.stringContaining("호수"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.38.0")).toMatchObject({
      version: "0.38.0",
      title: expect.stringContaining("맞았"),
      change: expect.stringContaining("밀치기"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.37.0")).toMatchObject({
      version: "0.37.0",
      title: expect.stringContaining("폭탄"),
      change: expect.stringContaining("해안"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.36.0")).toMatchObject({
      version: "0.36.0",
      title: expect.stringContaining("아이템"),
      change: expect.stringContaining("봇"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.35.0")).toMatchObject({
      version: "0.35.0",
      title: expect.stringContaining("대포"),
      change: expect.stringContaining("돌탄"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.34.1")).toMatchObject({
      version: "0.34.1",
      change: expect.stringContaining("개발자"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.34.0")).toMatchObject({
      version: "0.34.0",
      title: expect.stringContaining("마지막 땅"),
    });
    expect(VERSION_HISTORY.find(({ version }) => version === "0.33.0")).toMatchObject({
      version: "0.33.0",
      change: expect.stringContaining("호수"),
    });
    expect(VERSION_HISTORY.length).toBeGreaterThanOrEqual(6);

    for (const entry of VERSION_HISTORY) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.change.length).toBeGreaterThan(0);
      expect(`${entry.title} ${entry.reason} ${entry.change}`).toContain("다요");
    }
  });
});
