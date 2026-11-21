import { AgentLogPanel } from "@/components/agent-log-panel";
import { AppHeader } from "@/components/app-header";
import { CandidateChips } from "@/components/candidate-chips";
import { CardCollection } from "@/components/card-collection";
import { GradeBadge } from "@/components/grade-badge";
import { InlineLog } from "@/components/inline-log";
import { ChatInput } from "@/components/chat-input";
import { CompanyCard } from "@/components/company-card";
import { Disclaimer } from "@/components/disclaimer";
import { LofiBox } from "@/components/lofi-box";
import { MatchupPair } from "@/components/matchup-card";
import { QuickReplies } from "@/components/quick-replies";
import { ReportCard } from "@/components/report-card";
import type { LogLine } from "@/lib/chat";
import { getBusinessSummary } from "@/lib/business-summary";
import { getMode } from "@/lib/config";
import { findMockCandidates, getMockCompany, toCandidateSummary } from "@/lib/data";
import { computeIndicators } from "@/lib/indicators";
import { SAMPLE_MATCHUP_PAIR } from "@/lib/samples";

/** 카탈로그는 미리 그려 두는 페이지라 현재 시각 대신 고정 기준일로 등급을 계산한다 (투자 18개월 계산에 쓰임) */
const CATALOG_AS_OF = new Date(2026, 10, 20);

const SAMPLE_LOG: LogLine[] = [
  { step: 1, type: "tool_call", title: "search_company: \"몽돌커머스\" 후보 2곳", mode: "mock" },
  { step: 2, type: "decision", title: "후보가 여럿이라 사용자에게 묻기로 함", reason: "이름이 같은 법인이 2곳", mode: "mock" },
  { step: 3, type: "unavailable", title: "재무 체력: 확인 불가", reason: "비공시 법인이라 재무 공시 의무 없음", mode: "mock" },
  { step: 4, type: "fallback", title: "3년차 공고 없음, 유사 기업 공고로 대체", reason: "같은 업종, 비슷한 규모", mode: "mock" },
];

/** 개발용: 화면의 모든 요소를 한 페이지에 모아 이름과 모양을 확인한다. 디자인 시안을 맞출 때 쓴다 */
export default function CatalogPage() {
  const mode = getMode();
  const startup = getMockCompany("mock-001");
  const general = getMockCompany("mock-026");
  const twins = findMockCandidates("몽돌커머스").map(toCandidateSummary);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <AppHeader mode={mode} />
      <LofiBox label="안내">
        <p className="text-sm">
          화면에 쓰이는 요소를 한곳에 모은 개발용 페이지입니다. 이름표가 붙은 상자 하나가 요소 하나입니다. 데이터는 전부 목업입니다.
        </p>
      </LofiBox>

      <h2 className="text-base font-bold">01 시작과 직무 선택</h2>
      <QuickReplies
        replies={[
          { label: "서비스기획", value: "a" },
          { label: "마케팅", value: "b" },
          { label: "운영", value: "c" },
        ]}
      />
      <QuickReplies
        replies={[
          { label: "맞대결 먼저", value: "a" },
          { label: "바로 기업 분석", value: "b" },
        ]}
      />
      <ChatInput />

      <h2 className="text-base font-bold">등급 배지 (한 색, 채움으로 구분)</h2>
      <div className="flex items-center gap-2 text-xs">
        <GradeBadge grade="A" /> 꽉 채움 <GradeBadge grade="B" /> 옅게 채움 <GradeBadge grade="C" /> 테두리만{" "}
        <GradeBadge grade={null} /> 점선
      </div>

      <h2 className="text-base font-bold">02 선호 파악 (맞대결)</h2>
      <div className="max-w-[380px]">
        <p className="mb-1 text-xs text-muted">모바일 폭 380px 확인용</p>
        <MatchupPair cards={SAMPLE_MATCHUP_PAIR} />
      </div>

      <h2 className="text-base font-bold">03 기업 특정 (동명 판별)</h2>
      <CandidateChips candidates={twins} />

      <h2 className="text-base font-bold">04 기업 실사 (지표 카드)</h2>
      <p className="text-xs text-muted">
        아래 두 장은 &quot;하는 일 세 줄 요약&quot;의 두 상태입니다: 사업보고서가 없는 비공시 스타트업(공시 없음), 사업의 개요가 있는 상장 일반 기업(3줄 요약).
      </p>
      {startup && (
        <CompanyCard company={startup} graded={computeIndicators(startup, CATALOG_AS_OF)} summary={getBusinessSummary(startup, "mock")} />
      )}
      {general && (
        <CompanyCard company={general} graded={computeIndicators(general, CATALOG_AS_OF)} summary={getBusinessSummary(general, "mock")} />
      )}

      <h2 className="text-base font-bold">06 판단 리포트 카드 (앞면 결론, 뒷면 근거)</h2>
      <ReportCard />

      <h2 className="text-base font-bold">07 판단 로그 (말풍선 안 진행 기록, 옆 패널)</h2>
      <p className="text-xs text-muted">&quot;판단&quot; 배지는 에이전트가 직접 고른 줄에만 붙고, 코드가 한 일은 흐린 배지로 보입니다.</p>
      <InlineLog lines={SAMPLE_LOG} />
      <div className="md:max-w-[320px]">
        <AgentLogPanel lines={SAMPLE_LOG} />
      </div>

      <h2 className="text-base font-bold">내 카드 모음</h2>
      <div className="md:max-w-[320px]">
        <CardCollection
          records={[
            { companyId: "mock-001", name: startup?.name ?? "목업 기업", analyzedAt: "2026-11-19T00:00:00.000Z", label: null, log: [] },
          ]}
        />
      </div>

      <Disclaimer />
    </main>
  );
}
