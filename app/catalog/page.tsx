import { AgentLogPanel } from "@/components/agent-log-panel";
import { AppHeader } from "@/components/app-header";
import { CandidateChips } from "@/components/candidate-chips";
import { CardCollection } from "@/components/card-collection";
import { ChatInput } from "@/components/chat-input";
import { CompanyCard } from "@/components/company-card";
import { Disclaimer } from "@/components/disclaimer";
import { GradeBadge } from "@/components/grade-badge";
import { InlineLog } from "@/components/inline-log";
import { MatchupPair } from "@/components/matchup-card";
import { QuickReplies } from "@/components/quick-replies";
import { ReportCard } from "@/components/report-card";
import type { LogLine } from "@/lib/chat";
import { getBusinessSummary } from "@/lib/business-summary";
import { getMode } from "@/lib/config";
import { findMockCandidates, getMockCompany, toCandidateSummary } from "@/lib/data";
import { computeIndicators } from "@/lib/indicators";
import { buildReportDraft } from "@/lib/report-draft";
import { SAMPLE_MATCHUP_PAIR, SAMPLE_REPORT_CARD } from "@/lib/samples";

/** 카탈로그는 미리 그려 두는 페이지라 현재 시각 대신 고정 기준일로 등급을 계산한다 (투자 18개월 계산에 쓰임) */
const CATALOG_AS_OF = new Date(2026, 10, 20);

const SAMPLE_LOG: LogLine[] = [
  { step: 1, type: "tool_call", title: "search_company: \"몽돌커머스\" 후보 2곳", mode: "mock" },
  { step: 2, type: "decision", title: "후보가 여럿이라 사용자에게 묻기로 함", reason: "이름이 같은 법인이 2곳", mode: "mock" },
  { step: 3, type: "unavailable", title: "재무 체력: 확인 불가", reason: "비공시 법인이라 재무 공시 의무 없음", mode: "mock" },
  { step: 4, type: "fallback", title: "3년차 공고 없음, 유사 기업 공고로 대체", reason: "같은 업종, 비슷한 규모", mode: "mock" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, paddingBottom: 8, borderBottom: "1px solid var(--gray-4)", margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

/** 개발용: 화면의 모든 요소를 한 페이지에 모아 모양을 확인한다. 데이터는 전부 목업이다 */
export default function CatalogPage() {
  const mode = getMode();
  const startup = getMockCompany("mock-001");
  const general = getMockCompany("mock-026");
  const twins = findMockCandidates("몽돌커머스").map(toCandidateSummary);
  const graded = startup ? computeIndicators(startup, CATALOG_AS_OF) : [];
  const report = startup
    ? buildReportDraft({ company: startup, graded, role: "서비스기획", preference: null, log: SAMPLE_LOG, checkedAt: "2026-11-20", mode: "mock" })
    : SAMPLE_REPORT_CARD;

  return (
    <main className="wrap">
      <div className="app">
        <AppHeader mode={mode} />
      </div>
      <p className="small muted">화면에 쓰이는 요소를 한곳에 모은 개발용 페이지입니다. 데이터는 전부 목업입니다.</p>

      <Section title="01 시작과 직무 선택">
        <QuickReplies replies={[{ label: "서비스기획", value: "a" }, { label: "마케팅", value: "b" }, { label: "운영", value: "c" }]} />
        <QuickReplies
          replies={[
            { label: "기업 밸런스 게임 시작하기", value: "a", main: true },
            { label: "건너뛰기(일반 기준 적용)", value: "b" },
          ]}
        />
        <div className="inputbar" style={{ position: "static", border: 0, padding: 0 }}>
          <ChatInput />
        </div>
      </Section>

      <Section title="등급 배지 (보라 한 색, 채움으로 구분)">
        <div className="quick small" style={{ alignItems: "center" }}>
          <GradeBadge grade="A" /> 꽉 채움 <GradeBadge grade="B" /> 연하게 채움 <GradeBadge grade="C" /> 테두리만 <GradeBadge grade={null} /> 확인 불가
        </div>
      </Section>

      <Section title="02 선호 파악 (밸런스 게임, 380px 확인용)">
        <div style={{ maxWidth: 380 }}>
          <MatchupPair cards={SAMPLE_MATCHUP_PAIR} />
        </div>
      </Section>

      <Section title="03 기업 특정 (동명 판별)">
        <CandidateChips candidates={twins} />
      </Section>

      <Section title="04 기업 실사 (기업 카드)">
        {startup && <CompanyCard company={startup} graded={graded} summary={getBusinessSummary(startup, "mock")} />}
        {general && <CompanyCard company={general} graded={computeIndicators(general, CATALOG_AS_OF)} summary={getBusinessSummary(general, "mock")} />}
      </Section>

      <Section title="06 최종 판단 리포트 카드 (앞면 결론, 뒷면 근거)">
        <ReportCard data={report} />
      </Section>

      <Section title="07 진행 기록과 에이전트 사고 과정">
        <div className="bubble">
          <p>같은 이름의 회사가 2곳 있습니다.</p>
          <InlineLog lines={SAMPLE_LOG} />
        </div>
        <div style={{ maxWidth: 320 }}>
          <AgentLogPanel lines={SAMPLE_LOG} />
        </div>
      </Section>

      <Section title="기업 카드 모음">
        <CardCollection
          records={[
            {
              companyId: "mock-001",
              name: startup?.name ?? "목업 기업",
              analyzedAt: "2026-11-19T00:00:00.000Z",
              label: null,
              log: [],
              lastRole: "서비스기획",
              reports: { 서비스기획: { report, personalized: false, savedAt: "2026-11-19T00:00:00.000Z" } },
            },
          ]}
        />
      </Section>

      <div className="app">
        <Disclaimer />
      </div>
    </main>
  );
}
