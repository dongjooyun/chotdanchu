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

- 스타트업: 비상장이면서 투자 유치 공식 발표나 기술·플랫폼 기반 성장형 사업 신호가 있는 기업. 업력 7년 이내(`foundedOn` 기준)는 신호를 강하게 하지만 필수 조건이 아니다. 그 외는 일반 기업(대·중견·중소, 상장사 포함).
- `natureBasis`에 판정 근거를 한 줄로 적는다. 카드의 유형 배지 옆에 그대로 보인다.

## 3. 기업 카드 (`Company`)

| 필드 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `id` | string | 목업은 `mock-001`, 실데이터는 OpenDART 고유번호, DART에 없으면 `manual-영문이름` | `mock-001` |
| `corpCode` | string \| null | OpenDART 고유번호. 없으면 null | `null` |
| `bizRegNo` | string \| null | 사업자등록번호. DART 기업개황에서 받거나, 시연 기업은 회사 홈페이지에서 사람이 확인 | `000-00-00000` |
| `bizRegNoSource` | Source \| null | 사업자등록번호를 어디서 확인했는지 | |
| `name` | string | 법인명 | `하늘커머스(주)` |
| `ceoName` | string | 대표자. 화면 표시 전용, LLM에 보내지 않음. 실데이터는 OpenDART 기업개황에 공시된 이름 (11/21 결정) | `가상대표` |
| `address` | string | 시·구까지만 | `서울 성동구` |
| `industry` | string | 업종명 | `전자상거래 소매 중개업` |
| `industryCode` | string \| null | 표준산업분류(KSIC) 코드. 기술 투자의 업종 구간을 정할 때 쓴다 | `47911` |
| `foundedOn` | string \| null | 설립일 `YYYY-MM-DD`. 업력 판정에 쓴다 | `2021-03-02` |
| `disclosure` | `listed` \| `audited` \| `unlisted` | 공시 수준 | `unlisted` |
| `nature` | `startup` \| `general` | 기업 성격 | `startup` |
| `natureBasis` | string | 유형 판정 근거 한 줄 | `설립 4년, 2025년 시리즈 A 공식 발표` |
| `certifications` | string[] | 공공 인증(보조 신호): 이노비즈, 메인비즈, 워크넷 강소기업 | `["이노비즈"]` |
| `businessOverview` | BusinessOverview (선택) | 사업보고서 "사업의 개요" 문단 하나와 원문 링크. 목업 전용 샘플이고, 사업보고서가 없는 기업은 이 필드가 없다 ("공시 없음", 아래 3-1) | |
| `indicators` | IndicatorValue[] | 아래 9개 지표 (정보 투명도 제외) | |
| `aliases` | string[] (선택) | 사람들이 부르는 다른 이름. 검색에 쓴다 | `["당근"]` |
| `externalLinks` | {name, url}[] | "원문 보기" 링크 (theVC, 혁신의숲 등). 데이터는 가져오지 않는다 | |
| `isMock` | boolean | 목업이면 true | `true` |

### 3-1. 하는 일 세 줄 요약 (`BusinessSummary`, CDC-26)

기업 카드에 보이는 요약의 상태 세 가지. 계산하는 곳은 `lib/business-summary.ts`이고 데이터 파일에는 저장하지 않는다 (실데이터의 사전 계산 결과 파일은 `data/real/business-summaries.json`).

| 상태 | 뜻 | 화면 |
|---|---|---|
| `ok` | 요약 3줄과 원문 링크가 있다. `method`는 `rule`(코드가 문장을 뽑음) 또는 `llm`(작은 모델이 요약하고 코드가 검증함) | 3줄 + 원문 링크 (목업은 "가상 링크") |
| `no_report` | 사업보고서가 없는 기업. 확인한 결과다 | "공시 없음". 요약은 보여주지 않는다 |
| `unavailable` | 아직 계산하지 않았거나(`not_computed`) 조회에 실패했다(`fetch_failed`). 결과를 모르는 상태다 | "확인 불가"와 이유 |

- 요약은 수치 없이 문장으로만 쓴다. 숫자가 든 문장은 코드가 걸러 낸다 (CLAUDE.md 3번)
- "공시 없음"과 "확인 불가"는 다르게 보인다. 앞은 "사업보고서를 확인했더니 없음", 뒤는 "아직 모름"이다
- 목업: `businessOverview` 필드가 있으면 `ok`, 없으면 `no_report`
- 실데이터: 사전 계산 파일에 기업이 있으면 그 상태를 그대로 쓰고, 파일에 없으면 `unavailable`(`not_computed`)

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
| `title` | string | 쓰지 않음. 화면에서는 판마다 왼쪽 `기업 A`, 오른쪽 `기업 B`로 붙인다 (등급 A/B와 헷갈리지 않게) |
| `archetype` | PreferenceType | 이 카드를 설계할 때 겨냥한 유형 |
| `grades` | {IndicatorId: A/B/C/unavailable} | 카드에 보이는 등급. 원시값 없이 등급만 (가상 카드라 계산할 원시값이 없다) |

- 8강 토너먼트: 8강 4판(1-2, 3-4, 5-6, 7-8), 4강 2판, 결승 1판. 대진표는 고정이고 8강은 매 판 다른 유형끼리 붙는다.
- 카드에는 지표 6개(재무 체력, 성장성, 고용 흐름, 보상, 근속, 투자 단계)만 보인다. 유형마다 두 지표씩 묶여 있다: 안정·시스템(재무, 근속), 자율·개척(성장, 투자 단계), 밸런스·실속(보상, 고용 흐름).
- 계산(`lib/matchup.ts`): 판마다 이긴 카드와 진 카드의 등급 차이(A 1, B 0.5, C 0)를 특징으로 Bradley-Terry(로지스틱) 계수를 L2 규제 0.5, 경사 상승 300번으로 구한다. 두 카드 중 하나라도 확인 불가인 지표는 그 판에서 0으로 둬 뺀다. 계수를 softmax로 바꿔 10개 지표 중요도(합 1)를 만들고, 카드에 없는 지표는 계수 0이라 기본 비중을 받는다. 유형은 묶음 점수가 가장 큰 쪽이고, 1·2위 차이가 0.01 미만이면 밸런스·실속이다.

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
      "log": [],
      "lastRole": "서비스기획",
      "analysis": { "company": "(기업 카드 내용)", "graded": "(등급 10개)" },
      "reports": {
        "서비스기획": { "report": "(최종 판단 리포트 카드 내용, lib/report-card.ts)", "personalized": false, "savedAt": "2026-11-21T04:00:00.000Z" }
      }
    }
  ]
}
```

- `role`: `서비스기획`, `마케팅`, `운영` (역량 사전과 같은 이름)
- `preference.type`: `stable_system` 안정·시스템 지향, `autonomy_pioneer` 자율·개척 지향, `balance_practical` 밸런스·실속 지향 (기업 선택 가치관 3유형)
- `preference.skipped`가 true면 모든 지표를 같은 비중으로 본다
- `weights`는 10개 지표 전부, 합 1 (위 예시는 일부만 적음)
- `analyzed`: 기업 카드 모음. 기업 하나에 한 장이고(최대 10장), "기업 카드 저장하기"를 누르거나 최종 판단 리포트가 나오면 담긴다. 판단 로그(`log`)를 같이 저장한다
- `reports`: 직무별 리포트. `personalized`가 true면 "맞춤 판정 완료", false면 "기본 기준". 같은 기업의 다른 직무를 저장하면 같은 카드에 직무가 늘어난다(화면에 "직무 2/3")
- `analysis`: 맞춤 판정을 나중에 받거나 성향이 바뀌어 다시 판정할 때 쓰는 기업 카드 내용
- `label`: 가장 최근 직무의 판정 라벨. 라벨 체계는 PRD 06
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
- 상장 5곳(`mock-026`~`mock-030`)에는 가상 "사업의 개요" 문단(`businessOverview`)이 있다. 나머지 25곳은 사업보고서가 없는 경우라 이 필드가 없고, 카드에 "공시 없음"이 보인다 (CDC-26)

## 8. 3년차 공고 (`data/real/postings.json`, `data/mock/postings.json`)

실데이터 모드는 시연 기업 4곳 x 3직무 = 12칸(준오 수동 확인 시드, 원본은 `data/real/postings-seed.md`), 목업 모드는 직무별 가상 공고 1건씩이다. 읽는 코드는 `lib/career-gap.ts`.

| 필드 | 뜻 |
|---|---|
| `companyId` | 비교 대상 기업의 OpenDART 고유번호. 목업 가상 공고는 `*` |
| `role` | 서비스기획, 마케팅, 운영 |
| `postedBy`, `title`, `years` | 공고를 낸 회사(대체 칸이면 다른 회사), 공고 제목, 원문 요구 연차 |
| `url`, `checkedAt` | 회사 공식 채용 페이지 원문 링크, 확인 날짜. 가상 공고는 `url`이 빈 문자열 |
| `substitute` | 같은 회사 공고가 없어 유사 기업 공고로 대신했으면 `{ reason }`, 아니면 null |
| `requirements[]` | `text`(요구 역량 문장 발췌), `phrases`(문장에서 고른 역량 표현), `preferred`(우대 항목) |

- 역량 갭: 역량 표현 하나씩 센다(같은 역량은 한 번). 같은 직무의 신입 역량(사전에서 `data/competencies/year3-expected.json`의 10개를 뺀 것)에 맞으면 `connected`(신입 때 쌓을 수 있음), 아니면 `missing`(따로 채움, `why`: `year3` 3년차 때 새로 요구, `other_role` 다른 직무의 역량, `unknown` 사전에 없음). `phrases`가 빈 문장(연차 조건, 태도, 직무 공통 소통)과 우대 항목은 세지 않는다. 이어짐 비율 = connected / 전체
- 판정 라벨(`lib/fit-label.ts`): 정보 투명도 C이거나 공고가 없으면 정보 보강. 아니면 이어짐 비율과 회사 기반 점수(선호 가중치로 낸 등급 평균, A 1, B 0.5, C 0, 확인 불가 제외)가 각각 기반 0.75, 이어짐 0.6 이상인지로 최적, 도전, 안정, 고려를 고른다

## 9. 카드 공유 링크 (`/card`)

`/card?c=<기업 ID>&r=<직무>&w=<가중치>`. `w`는 맞대결로 판정한 카드에만 있고, 지표 10개의 가중치를 1000배 반올림한 정수를 `_`로 이은 값이다(`lib/share.ts`). 링크에는 이 세 값 외에 아무것도 담지 않는다(개인정보 없음). 열면 서버가 같은 코드(`computeIndicators`, `buildReportDraft`)로 카드를 다시 계산해 그린다. 에이전트 판단 로그는 링크에 없으므로 뒷면의 "AI 판단" 줄은 비어 있다.
