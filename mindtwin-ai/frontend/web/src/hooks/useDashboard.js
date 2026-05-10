import { useQueries } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboardApi';

export function useDashboard() {
  const results = useQueries({
    queries: [
      { queryKey: ['today-sessions'], queryFn: dashboardApi.getTodaySessions, retry: 1, staleTime: 30_000 },
      { queryKey: ['exams'], queryFn: dashboardApi.getExams, retry: 1, staleTime: 60_000 },
      { queryKey: ['profile'], queryFn: dashboardApi.getProfile, retry: 1, staleTime: 120_000 },
      { queryKey: ['token-balance'], queryFn: dashboardApi.getTokenBalance, retry: 1, staleTime: 30_000 },
      { queryKey: ['stress-current'], queryFn: dashboardApi.getStressCurrent, retry: 1, staleTime: 60_000 },
    ],
  });

  const [todayQ, examsQ, profileQ, tokenQ, stressQ] = results;

  return {
    todaySessions: todayQ.data?.sessions ?? [],
    todayDate: todayQ.data?.date ?? '',
    exams: examsQ.data?.exams ?? [],
    profile: profileQ.data?.profile ?? null,
    tokenBalance: tokenQ.data?.balance ?? 0,
    earnedToday: tokenQ.data?.earned_today ?? 0,
    stressScore: stressQ.data?.score ?? 0.2,
    isLoading: results.some(r => r.isLoading),
    isError: results.every(r => r.isError),
    refetchAll: () => results.forEach(r => r.refetch()),
    refetchSessions: todayQ.refetch,
    refetchTokens: tokenQ.refetch,
  };
}
