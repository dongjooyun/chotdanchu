# 데이터 스키마

기업 카드, 맞대결 카드, 세션 상태의 모양을 정한 문서. 코드의 타입은 `lib/types.ts`에 같은 내용으로 있다. 둘 중 하나를 고치면 다른 쪽도 고친다.

- 무엇을, 왜: 노션 [첫단추 PRD](https://app.notion.com/p/41c991804aa781b7a3daebcb0d6461ca) (특히 04 기업 실사)
- 지표별 A/B/C 기준값: [`docs/indicators.md`](indicators.md)

## 1. 원칙

1. **데이터에는 원시값과 출처만 넣는다.** A/B/C 등급은 코드(`compute_indicators`)가 `indicators.md` 기준표로 계산한다. 목업도 같다. 등급을 손으로 적지 않는다.
2. **지표 id는 영문, 화면 이름은 한글.** 선호 가중치, 세션 상태, 카드가 모두 같은 id를 쓴다.
3. **근거가 없으면 `value: null`, `status: "unavailable"`, `reason`을 채운다.** 그럴듯한 값으로 메우지 않는다.
4. **대표자 이름은 화면 표시 전용이다.** 동명 기업 후보를 보여줄 때만 쓰고, LLM 프롬프트에는 넣지 않는다 (CLAUDE.md 절대 규칙 1). 목업의 대표자는 가상 이름이다.
5. **정보 투명도는 저장하지 않는다.** 나머지 9개 지표에서 코드가 계산한다.

## 2. 기업 유형 (두 축)

| 필드 | 값 | 뜻 | 정하는 것 |
|---|---|---|---|
| `disclosure` | `listed` 상장, `audited` 외감, `unlisted` 비공시 | 공시 수준 | 어떤 데이터가 있는가 (출처) |
| `nature` | `startup` 스타트업, `general` 일반 기업 | 기업 성격 | 어떤 기준표로 판단하는가 |

- 스타트업: 업력 7년 이내 + 투자 유치 공식 발표나 기술·플랫폼 기반 성장형 사업. 그 외는 일반 기업(대·중견·중소).
- `natureBasis`에 판정 근거를 한 줄로 적는다. 카드의 유형 배지 옆에 그대로 보인다.

## 3. 기업 카드 (`Company`)

| 필드 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `id` | string | 목업은 `mock-001`, 실데이터는 OpenDART 고유번호, DART에 없으면 `manual-영문이름` | `mock-001` |
| `corpCode` | string \| null | OpenDART 고유번호. 없으면 null | `null` |
| `bizRegNo` | string \| null | 사업자등록번호. DART 기업개황에서 받거나, 시연 기업은 회사 홈페이지에서 사람이 확인 | `000-00-00000` |
| `bizRegNoSource` | Source \| null | 사업자등록번호를 어디서 확인했는지 | |
| `name` | string | 법인명 | `하늘커머스(주)` |
| `ceoName` | string | 대표자. 화면 표시 전용 | `가상대표` |
| `address` | string | 시·구까지만 | `서울 성동구` |
| `industry` | string | 업종명 | `전자상거래 소매 중개업` |
| `industryCode` | string \| null | 표준산업분류(KSIC) 코드. 기술 투자의 업종 구간을 정할 때 쓴다 | `47911` |
| `foundedOn` | string \| null | 설립일 `YYYY-MM-DD`. 업력 판정에 쓴다 | `2021-03-02` |
| `disclosure` | `listed` \| `audited` \| `unlisted` | 공시 수준 | `unlisted` |
| `nature` | `startup` \| `general` | 기업 성격 | `startup` |
| `natureBasis` | string | 유형 판정 근거 한 줄 | `설립 4년, 2025년 시리즈 A 공식 발표` |
| `certifications` | string[] | 공공 인증(보조 신호): 이노비즈, 메인비즈, 워크넷 강소기업 | `["이노비즈"]` |
| `indicators` | IndicatorValue[] | 아래 9개 지표 (정보 투명도 제외) | |
| `externalLinks` | {name, url}[] | "원문 보기" 링크 (theVC, 혁신의숲 등). 데이터는 가져오지 않는다 | |
| `isMock` | boolean | 목업이면 true | `true` |

## 4. 지표 값 (`IndicatorValue`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | IndicatorId | 아래 표의 id |
| `metric` | string | 어떤 숫자인지. 기준표마다 다를 수 있다 (예: 재무 체력은 일반 기업 `debt_ratio`, 스타트업 `runway_months`) |
| `status` | `ok` \| `estimated` \| `manual` \| `unavailable` | `estimated`: 추정치(보상). `manual`: 공식 발표를 사람이 확인한 값 |
| `value` | number \| null | 원시값. 확인 불가면 null |
| `range` | [number, number] | `estimated`일 때 범위 |
| `unit` | string | `%`, `만원`, `년`, `건`, `개월`, `억원` |
| `period` | string \| null | 기준 시점 (`2025`, `2026-09`) |
| `label` | string | 숫자가 아닌 값 (투자 라운드 `Series A`, 리스크 `해당 없음`) |
| `extra` | {이름: 숫자} | 보조 수치 (유보율, 1인당 영업이익, 월 퇴사율, 업종 평균 연봉 등) |
| `source` | Source \| null | `{ name, url, checkedAt }`. `manual`이면 원문 링크와 확인 날짜 필수 |
| `reason` | `not_disclosed` \| `no_source` \| `fetch_failed` | 확인 불가 이유 |

| id | 화면 이름 | 일반 기업 metric | 스타트업 metric |
|---|---|---|---|
| `financial_health` | 재무 체력 | `debt_ratio` 부채비율(%) | `runway_months` 런웨이(개월, 외감일 때) |
| `growth` | 성장성 | `revenue_growth` 매출 증가율(%) | 같음 (외감일 때) |
| `profitability` | 수익성 | `operating_margin` 영업이익률(%) | `operating_income` 영업이익(억원), `extra.prev` 전년 |
| `hiring_flow` | 고용 흐름 | `headcount_change_12m` 12개월 인원 증감률(%), `extra.annual_attrition` | 같음, `extra.monthly_attrition` |
| `compensation` | 보상 | `avg_salary` 평균 연봉 추정(만원, 범위), `extra.industry_avg` | 같음 |
| `tenure` | 근속 | `avg_tenure` 평균 근속(년, 사업보고서 제출 법인만) | 같음 (사업보고서를 내는 비상장이면 자동, 아니면 확인 불가) |
| `tech_investment` | 기술 투자 | `rnd_ratio` 매출 대비 R&D(%) | `registered_patents` 등록 특허(건) |
| `funding_stage` | 투자 단계 | 등급 없음 | `cumulative_funding` 누적 투자(억원), `label` 라운드, `period` 최근 투자 시점 |
| `risk` | 리스크 | `label` 해당 없음 / 경미 / 해당, `extra`에 해당 항목 | 같음 |
| `transparency` | 정보 투명도 | 저장 안 함 (코드 계산) | 같음 |

## 5. 맞대결 카드 (`MatchupCard`)

맞대결은 목업 여부와 상관없이 항상 같은 가상 카드를 쓴다. 그래서 `data/mock/`이 아니라 `data/matchup/`에 둔다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | `card-1` ~ `card-8` |
| `title` | string | 화면 이름. 기업명 대신 `카드 A` |
| `archetype` | PreferenceType | 이 카드를 설계할 때 겨냥한 유형 |
| `grades` | {IndicatorId: A/B/C/unavailable} | 카드에 보이는 등급. 원시값 없이 등급만 (가상 카드라 계산할 원시값이 없다) |

- 8강 토너먼트: 8강 4판, 4강 2판, 결승 1판. 대진표는 고정이다.
- 각 판의 두 카드는 지표 2~3개만 크게 다르게 설계한다. 그래야 선택이 무엇을 중시하는지 드러난다.

## 6. 선호와 세션 상태 (브라우저 localStorage)

```json
{
  "role": "서비스기획",
  "preference": {
    "skipped": false,
    "type": "autonomy_pioneer",
    "topIndicators": ["growth", "tech_investment", "funding_stage"],
    "weights": { "growth": 0.22, "tech_investment": 0.15, "funding_stage": 0.13 }
  },
  "analyzed": [
    {
      "companyId": "mock-001",
      "name": "하늘커머스(주)",
      "analyzedAt": "2026-11-20T14:00:00+09:00",
      "label": null,
      "log": []
    }
  ]
}
```

- `role`: `서비스기획`, `마케팅`, `운영` (역량 사전과 같은 이름)
- `preference.type`: `stable_system` 안정·시스템 지향, `autonomy_pioneer` 자율·개척 지향, `balance_practical` 밸런스·실속 지향 (KT 기업 선택 가치관 3유형)
- `preference.skipped`가 true면 모든 지표를 같은 비중으로 본다
- `weights`는 10개 지표 전부, 합 1 (위 예시는 일부만 적음)
- `analyzed`: 최근 분석 기록. 판단 로그(`log`)를 같이 저장해서 다시 열어볼 수 있다. 판단 로그 한 줄의 모양은 에이전트 루프(CDC-14)에서 확정한다
- `label`: 판단 리포트 라벨. 라벨 체계는 PRD 06에서 확정한다
- 개인 식별 정보는 넣지 않는다

## 7. 목업 기업 30곳 구성 (`data/mock/companies.json`)

스타트업 중심 시연에 맞춘 구성이다.

| 공시 수준 | 스타트업 | 일반 기업 | 합계 |
|---|---|---|---|
| 비공시 | 12 | 3 | 15 |
| 외감 | 4 | 6 | 10 |
| 상장 | 0 | 5 | 5 |
| 합계 | 16 | 14 | 30 |

- 동명 기업 쌍 3쌍을 넣는다 (예: 이름이 같고 소재지, 업종, 설립일이 다른 두 회사)
- 비공시 기업은 재무·성장·수익·근속을 `unavailable`(`not_disclosed`)로 둔다
- 투자 단계는 스타트업만 값이 있을 수 있고, 목업에서는 `manual` 대신 `ok`로 둔다 (가상 값)
- 기업명, 대표자는 전부 가상이다. 실존 기업과 겹치지 않게 한다
