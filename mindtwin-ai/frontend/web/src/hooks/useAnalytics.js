import { useState, useCallback } from 'react';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '../api/analyticsApi';

/**
 * useAnalytics
 * Fetches dashboard, insights, and twin evolution in parallel.
 * Exposes period state and a setter that triggers refetches.
 */
export function useAnalytics() {
  const [period, setPeriod] = useState('month'); // '7days' | 'month' | 'all'
  const queryClient = useQueryClient();

  const results = useQueries({
    queries: [
      {
        queryKey: ['analytics-dashboard', period],
        queryFn: () => analyticsApi.getDashboard(period),
        staleTime: 60 * 60 * 1000, // 1 hour — matches server-side Redis cache
        retry: 1,
      },
      {
        queryKey: ['analytics-insights'],
        queryFn: analyticsApi.getInsights,
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
      {
        queryKey: ['analytics-twin-evolution'],
        queryFn: analyticsApi.getTwinEvolution,
        staleTime: 10 * 60 * 1000,
        retry: 1,
      },
      {
        queryKey: ['analytics-progress', period],
        queryFn: () => analyticsApi.getProgress(null, period),
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    ],
  });

  const [dashboardQ, insightsQ, twinQ, progressQ] = results;

  // Dismiss insight mutation
  const dismissMutation = useMutation({
    mutationFn: analyticsApi.dismissInsight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-insights'] });
    },
  });

  const changePeriod = useCallback((newPeriod) => {
    setPeriod(newPeriod);
  }, []);

  const refetchAll = useCallback(() => {
    results.forEach(r => r.refetch());
  }, [results]);

  return {
    // Period control
    period,
    changePeriod,

    // Dashboard data
    dashboard: dashboardQ.data ?? null,
    timeline: dashboardQ.data?.timeline ?? [],
    exams: dashboardQ.data?.exams ?? [],

    // Progress data
    progressBySubject: progressQ.data?.progress_by_subject ?? [],
    mastery: progressQ.data?.mastery?.subjects ?? dashboardQ.data?.mastery?.subjects ?? [],

    // Insights
    insights: insightsQ.data?.insights ?? [],
    dismissInsight: dismissMutation.mutate,
    isDismissing: dismissMutation.isPending,

    // Twin evolution
    twinEvolution: twinQ.data ?? null,
    twinDimensions: twinQ.data?.labelled_dimensions ?? [],

    // Loading / error states
    isLoading: results.some(r => r.isLoading),
    isDashboardLoading: dashboardQ.isLoading,
    isInsightsLoading: insightsQ.isLoading,
    isTwinLoading: twinQ.isLoading,
    isError: results.every(r => r.isError),

    refetchAll,
  };
}
