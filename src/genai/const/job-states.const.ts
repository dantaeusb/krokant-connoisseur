import { JobState } from "@google/genai";

export const GENAI_JOB_STATES_PROGRESS: Array<JobState> = [
  JobState.JOB_STATE_UNSPECIFIED,
  JobState.JOB_STATE_QUEUED,
  JobState.JOB_STATE_PENDING,
  JobState.JOB_STATE_RUNNING,
  JobState.JOB_STATE_CANCELLING,
  JobState.JOB_STATE_UPDATING,
  JobState.JOB_STATE_PAUSED,
];

export const GENAI_JOB_STATES_SUCCESS: Array<JobState> = [
  JobState.JOB_STATE_SUCCEEDED,
];

export const GENAI_JOB_STATES_FAILED: Array<JobState> = [
  JobState.JOB_STATE_FAILED,
  JobState.JOB_STATE_CANCELLED,
  JobState.JOB_STATE_EXPIRED,
  JobState.JOB_STATE_PARTIALLY_SUCCEEDED,
];
