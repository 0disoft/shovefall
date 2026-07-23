import { PRODUCT_VERSION } from "../simulation/versions";

export interface VersionHistoryEntry {
  readonly version: string;
  readonly title: string;
  readonly reason: string;
  readonly change: string;
}

export const VERSION_HISTORY: readonly VersionHistoryEntry[] = Object.freeze([
  Object.freeze({
    version: "0.29.0",
    title: "물이 길이 되는 5초",
    reason: "호수와 잠긴 바닥을 피하기만 하지 말고, 위험할 때 가로지를 선택지도 필요했어.",
    change:
      "배를 한 번 띄우면 5초 동안 섬 안의 물 위를 움직일 수 있어. 공격은 그대로 맞고 맵 밖에서는 가라앉아.",
  }),
  Object.freeze({
    version: "0.28.0",
    title: "내 앞에 벽 하나",
    reason: "장풍과 밀치기를 피하기만 하지 말고, 위험한 자리에서 잠깐 숨을 곳도 만들고 싶었어.",
    change:
      "벽돌 가방으로 앞 칸에 벽을 네 번 세울 수 있어. 벽은 공격과 충돌을 막지만 땅이 잠기면 같이 사라져.",
  }),
  Object.freeze({
    version: "0.27.0",
    title: "손이 안 닿아도 날려 보내기",
    reason: "커진 섬에서는 가까이 붙는 밀치기만으로 빈틈을 뒤집기 어려웠어.",
    change: "Q와 E로 시작 아이템을 쓰고, 장풍은 앞에 선 한 명을 몸무게에 따라 크게 날려.",
  }),
  Object.freeze({
    version: "0.26.0",
    title: "50명이 뛰는 더 큰 섬",
    reason: "모드가 많아질수록 뭘 골라야 할지만 복잡해지고, 작은 섬은 금방 끝났어.",
    change: "50인전 하나로 모으고 섬과 호수를 키웠어. 몸무게는 50부터 100까지 직접 고를 수 있어.",
  }),
  Object.freeze({
    version: "0.25.0",
    title: "바뀐 이유도 남기기",
    reason: "게임은 계속 달라졌는데, 플레이하는 사람은 그 과정을 볼 곳이 없었어.",
    change: "메인 메뉴에 버전 기록을 열고 중요한 변화의 이유와 결과를 짧게 모았어.",
  }),
  Object.freeze({
    version: "0.24.0",
    title: "아레나를 비스듬하게",
    reason: "평평한 맵에 깊이를 더해서 밀치고 떨어지는 순간을 더 생생하게 만들고 싶었어.",
    change: "58도 시점과 절벽 두께, 캐릭터 그림자, 깊이 순서를 더했어.",
  }),
  Object.freeze({
    version: "0.23.0",
    title: "넓은 섬을 따라가는 카메라",
    reason: "시작 전에는 설정에 집중하고, 넓은 맵에서는 내 캐릭터를 놓치지 않아야 했어.",
    change: "메뉴·설정·아레나를 나누고 카메라가 플레이어를 따라가게 했어.",
  }),
  Object.freeze({
    version: "0.22.0",
    title: "매번 달라지는 무인도",
    reason: "반듯한 사각형 대신 지형을 읽고 위험을 감수하는 변수를 주고 싶었어.",
    change: "무작위 해안선과 호수, 가장자리 아이템, 20%까지 남는 붕괴 규칙을 넣었어.",
  }),
  Object.freeze({
    version: "0.21.0",
    title: "어디서든 움직이게",
    reason: "키보드만 고집하지 않고 손에 익은 방식으로 바로 움직일 수 있어야 했어.",
    change: "방향키, 마우스 드래그, 터치 조이스틱, 게임패드 조작을 한 흐름으로 묶었어.",
  }),
  Object.freeze({
    version: "0.20.0",
    title: "내 방식으로 싸우기",
    reason: "판마다 다른 선택으로 시작하고, 상대를 떨어뜨린 보상도 확실해야 재밌으니까.",
    change: "시작 몸무게와 아이템 두 개를 고르고 처치 포인트로 스탯을 올리게 했어.",
  }),
]);

if (VERSION_HISTORY[0]?.version !== PRODUCT_VERSION) {
  throw new Error("The latest version history entry must match the product version.");
}
