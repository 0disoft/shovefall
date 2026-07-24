import { PRODUCT_VERSION } from "../simulation/versions";

export interface VersionHistoryEntry {
  readonly version: string;
  readonly title: string;
  readonly reason: string;
  readonly change: string;
}

export const VERSION_HISTORY: readonly VersionHistoryEntry[] = Object.freeze([
  Object.freeze({
    version: "0.36.0",
    title: "컴퓨터도 아이템을 쓴다요 ㅇㅅㅇ",
    reason: "아이템을 주워 놓고 들고만 있으니 49명이 있어도 사람만 제대로 싸웠다요.",
    change:
      "봇도 장풍과 벽돌, 배, 폭탄, 비누, 갈고리를 상황에 맞춰 쓴다요. 폭탄과 배 같은 소품도 전장에서 바로 보인다요.",
  }),
  Object.freeze({
    version: "0.35.0",
    title: "대포가 섬을 삼킨다요 ㅇㅅㅇ",
    reason: "방향키와 밀치기만 연타하니 싸움이 너무 늘어졌다요.",
    change:
      "이동은 바로 반응하고 밀치기는 더 세졌다요. 해적선 포탄이 땅을 침수시키고 마지막엔 돌탄을 피해야 한다요.",
  }),
  Object.freeze({
    version: "0.34.1",
    title: "게임에만 집중하자요 ㅇㅅㅇ",
    reason: "복잡한 실험실 버튼은 플레이할 때 방해만 됐다요.",
    change: "공개 화면에서 개발자용 표시를 깔끔하게 치웠다요.",
  }),
  Object.freeze({
    version: "0.34.0",
    title: "마지막 땅도 안전하지 않다요",
    reason: "구석에 가만히 숨어 있으면 판이 끝나지 않았다요 ㅇㅅㅇ",
    change: "남은 땅 가운데서 해일이 밀어내고 몸무게 효과도 조금 다듬었다요.",
  }),
  Object.freeze({
    version: "0.33.0",
    title: "더 넓어진 난장판 무인도다요",
    reason: "다 같이 좁은 데 몰려 있으니 너무 답답했다요.",
    change: "섬을 훨씬 키우고 호수도 여덟 군데로 늘렸다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.32.1",
    title: "복잡한 숫자는 안녕이다요",
    reason: "게임에 필요 없는 숫자가 시선을 자꾸 빼앗았다요.",
    change: "공개 화면에서 틱과 시드 같은 개발 정보창을 싹 치웠다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.32.0",
    title: "떨어지기 전에 밧줄 잡다요",
    reason: "날아갈 때 손 놓고 떨어지는 건 너무 억울했다요.",
    change: "갈고리를 두 번 던져서 땅이나 벽을 붙잡을 수 있다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.31.0",
    title: "발밑을 조심하자요",
    reason: "쫓고 밀치는 길목에 함정을 놓고 싶었다요 ㅇㅅㅇ",
    change: "비누를 세 번 깔 수 있고 밟으면 훌러덩 미끄러진다요.",
  }),
  Object.freeze({
    version: "0.30.0",
    title: "5초 뒤에 쾅 터진다요",
    reason: "도망만 다니는 자리에도 미리 위험을 심고 싶었다요.",
    change: "폭탄을 놓으면 5초 뒤에 터지고 설치자도 휘말리게 했다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.29.0",
    title: "물 위로 슝 지나간다요",
    reason: "물이 막고 있다고 늘 돌아가는 건 지루했다요.",
    change: "배를 타고 5초 동안 호수와 잠긴 땅을 건널 수 있다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.28.0",
    title: "갑자기 벽이 짠 나타난다요",
    reason: "밀려날 때 잠깐 몸을 지킬 벽이 필요했다요.",
    change: "앞 칸에 벽돌을 네 번 세워서 밀치기와 장풍을 막을 수 있다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.27.0",
    title: "멀리서도 슉 날려버린다요",
    reason: "커진 섬에서는 때리러 가까이 가기가 너무 힘들었다요.",
    change: "Q와 E로 아이템을 쓰고 장풍으로 상대를 멀리 날릴 수 있다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.26.0",
    title: "50명이 다 같이 난장판이다요",
    reason: "모드가 많으니 복잡하고 작은 섬에서는 너무 빨리 끝났다요.",
    change: "50인전 하나로 모으고 몸무게도 50부터 100까지 직접 고르게 했다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.25.0",
    title: "무슨 일이 있었는지 보여준다요",
    reason: "게임이 어떻게 바뀌었는지 볼 곳이 없었다요.",
    change: "메인 메뉴에서 바꾼 이유와 결과를 바로 읽을 수 있게 했다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.24.0",
    title: "입체적으로 시원하게 본다요",
    reason: "밋밋한 평면은 밀리고 떨어지는 맛이 안 살았다요.",
    change: "화면을 비스듬히 기울이고 절벽과 그림자, 깊이감을 넣었다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.23.0",
    title: "카메라가 졸졸 따라다닌다요",
    reason: "넓은 섬에서 내 캐릭터를 자꾸 놓쳤다요.",
    change: "메뉴와 아레나를 나누고 카메라가 플레이어를 따라가게 했다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.22.0",
    title: "매판 새로워지는 무인도다요",
    reason: "똑같은 네모 맵은 금방 지루해졌다요.",
    change: "해안선과 호수가 매번 달라지고 땅은 20%까지 남게 했다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.21.0",
    title: "편한 대로 조작하자요",
    reason: "키보드 하나만 고집하면 손에 안 맞는 사람이 생겼다요.",
    change: "방향키와 마우스, 터치, 게임패드로도 움직일 수 있게 했다요 ㅇㅅㅇ",
  }),
  Object.freeze({
    version: "0.20.0",
    title: "내 맘대로 세팅한다요",
    reason: "상대를 떨어뜨렸으면 확실한 보상이 있어야 재밌다요.",
    change: "시작 무게와 아이템을 고르고 처치 포인트로 더 세질 수 있게 했다요 ㅇㅅㅇ",
  }),
]);

if (VERSION_HISTORY[0]?.version !== PRODUCT_VERSION) {
  throw new Error("The latest version history entry must match the product version.");
}
