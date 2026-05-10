import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stressApi } from '../api/stressApi';
import { useToast } from '../components/Toast';

export function useStress() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ['stress', 'current'],
    queryFn: stressApi.getCurrent,
    refetchInterval: 60000,
  });

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['stress', 'history'],
    queryFn: stressApi.getHistory,
  });

  const { data: wellness, isLoading: loadingWellness } = useQuery({
    queryKey: ['stress', 'wellness'],
    queryFn: stressApi.getWellness,
  });

  const logMoodMutation = useMutation({
    mutationFn: stressApi.logMood,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['stress']);
      if (data.tokens_awarded) {
        toast.success(`Mood logged! +${data.tokens_awarded} tokens awarded`);
      } else {
        toast.success('Mood logged successfully');
      }
    },
    onError: () => {
      toast.error('Failed to log mood');
    }
  });

  const ackMutation = useMutation({
    mutationFn: stressApi.acknowledgeIntervention,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['stress']);
      if (data.tokens_awarded) {
        toast.success(data.message || `+${data.tokens_awarded} tokens awarded!`);
      } else {
        toast.success(data.message || 'Intervention acknowledged');
      }
    },
    onError: () => {
      toast.error('Failed to process intervention');
    }
  });

  return {
    current,
    history,
    wellness,
    isLoading: loadingCurrent || loadingHistory || loadingWellness,
    logMood: logMoodMutation.mutateAsync,
    isLoggingMood: logMoodMutation.isPending,
    acknowledgeIntervention: ackMutation.mutateAsync,
  };
}
