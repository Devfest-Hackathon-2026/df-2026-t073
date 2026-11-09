import { copy } from '../../copy';
import type { QuestionType, ReviewStage } from '../../types';

// The type annotations make sure every stage and question type has a label.
export const STAGE_LABEL: Record<ReviewStage, string> = copy.reviewLabels.stages;

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> =
  copy.reviewLabels.questionTypes;
