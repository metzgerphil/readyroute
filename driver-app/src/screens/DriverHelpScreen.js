import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent
} from 'expo-speech-recognition';

import api from '../services/api';
import appTheme from '../theme/appTheme';
import { getApiErrorMessage } from '../utils/apiError';

const EXAMPLE_QUESTIONS = [
  'Signature package, nobody home',
  "I'm at a pickup but there is nothing here",
  "The barcode won't scan"
];

function splitAnswerIntoSteps(answer) {
  return (String(answer || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function getAnswerStructure(result) {
  const source = result?.answer_structure || {};
  const steps = Array.isArray(source.steps) && source.steps.length
    ? source.steps.map(String).filter(Boolean)
    : splitAnswerIntoSteps(result?.answer);
  return {
    steps,
    options: Array.isArray(source.options) ? source.options.filter((option) => option?.id && option?.label) : [],
    procedureSteps: Array.isArray(source.procedure_steps) ? source.procedure_steps.map(String).filter(Boolean) : [],
    documentation: Array.isArray(source.documentation) ? source.documentation.map(String).filter(Boolean) : [],
    prohibitedActions: Array.isArray(source.prohibited_actions) ? source.prohibited_actions.map(String).filter(Boolean) : [],
    escalationRequirements: Array.isArray(source.escalation_requirements)
      ? source.escalation_requirements.map(String).filter(Boolean)
      : []
  };
}

export default function DriverHelpScreen() {
  const inputRef = useRef(null);
  const [question, setQuestion] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [expandedOptionId, setExpandedOptionId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [dictationHint, setDictationHint] = useState(false);
  const [dictationError, setDictationError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const answerStructure = getAnswerStructure(result);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setDictationError('');
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = String(event.results?.[0]?.transcript || '').trim();
    if (transcript) {
      setQuestion(transcript);
      setError('');
      setDictationHint(true);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    if (event.error === 'aborted') {
      return;
    }

    const message = event.error === 'not-allowed'
      ? 'Microphone or speech recognition access is turned off. Enable both for ReadyRoute in iPhone Settings.'
      : event.error === 'no-speech'
        ? 'No speech was detected. Tap Speak and try again.'
        : 'ReadyRoute could not hear that question. Tap Speak and try again, or type it below.';
    setDictationError(message);
  });

  async function submitQuestion(nextQuestion = question) {
    const trimmedQuestion = String(nextQuestion || '').trim();
    if (trimmedQuestion.length < 2 || isSubmitting) {
      return;
    }

    setQuestion(trimmedQuestion);
    setIsSubmitting(true);
    setError('');
    setShowMore(false);
    setExpandedOptionId(null);
    setFeedback(null);

    try {
      const response = await api.post('/driver-help/query', {
        question: trimmedQuestion,
        ...(sessionId ? { session_id: sessionId } : {})
      });
      setSessionId(response.data?.session_id || sessionId);
      setResult(response.data || null);
      setQuestion('');
      setDictationHint(false);
    } catch (requestError) {
      const requestFailedBeforeVerification = requestError?.code === 'ECONNABORTED' || !requestError?.response;
      setError(requestFailedBeforeVerification
        ? 'Ready Route did not receive a verified answer. Check your connection and tap Ask Ready Route again. Contact your manager if you need an immediate answer.'
        : getApiErrorMessage(
          requestError,
          'Ready Route could not check the approved procedures right now. Contact your manager if you need an immediate answer.'
        ));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitFeedback(rating) {
    if (!result?.interaction_id || feedback || isSubmitting) {
      return;
    }

    setFeedback(rating);
    try {
      await api.post(`/driver-help/interactions/${result.interaction_id}/feedback`, { rating });
    } catch (_error) {
      setFeedback(null);
      setError('Feedback could not be saved. Your answer is still available.');
    }
  }

  async function toggleDictation() {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    setDictationError('');
    setDictationHint(false);

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setDictationError(
          'Microphone or speech recognition access is required. Enable both for ReadyRoute in iPhone Settings.'
        );
        return;
      }

      ExpoSpeechRecognitionModule.start({
        continuous: false,
        interimResults: true,
        iosTaskHint: 'dictation',
        lang: 'en-US',
        maxAlternatives: 1
      });
    } catch (_voiceError) {
      setIsListening(false);
      setDictationError(
        'ReadyRoute could not start the microphone. Check iPhone microphone access and try again.'
      );
    }
  }

  function chooseClarification(option) {
    const followUp = option?.query || option?.label || '';
    if (followUp) {
      submitQuestion(followUp);
    }
  }

  function startNewSituation() {
    setSessionId(null);
    setResult(null);
    setQuestion('');
    setShowMore(false);
    setExpandedOptionId(null);
    setFeedback(null);
    setError('');
    setDictationError('');
    setDictationHint(false);
  }

  function renderQuestionComposer(placeholder = 'Type the situation here...') {
    return (
      <View style={styles.questionCard}>
        <TextInput
          accessibilityLabel="Driver question"
          blurOnSubmit={false}
          maxLength={500}
          multiline
          onChangeText={(value) => {
            setQuestion(value);
            setError('');
          }}
          onSubmitEditing={() => submitQuestion()}
          placeholder={placeholder}
          placeholderTextColor={appTheme.colors.textTertiary}
          ref={inputRef}
          returnKeyType="send"
          style={styles.input}
          textAlignVertical="top"
          value={question}
        />
        <Pressable
          accessibilityLabel="Ask Ready Route"
          disabled={question.trim().length < 2 || isSubmitting}
          onPress={() => submitQuestion()}
          style={({ pressed }) => [
            styles.askButton,
            (question.trim().length < 2 || isSubmitting) ? styles.disabled : null,
            pressed && question.trim().length >= 2 && !isSubmitting ? styles.pressed : null
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={appTheme.colors.white} />
          ) : (
            <Text style={styles.askButtonText}>Ask Ready Route</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Operational help</Text>
            <Text style={styles.title}>What happened?</Text>
            <Text style={styles.subtitle}>
              Ask what to do. Ready Route will use only verified FedEx Ground material.
            </Text>
          </View>

          <Pressable
            accessibilityHint={isListening ? 'Stops speech recognition' : 'Starts speech recognition'}
            accessibilityLabel={isListening ? 'Stop listening' : 'Speak a question'}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={toggleDictation}
            style={({ pressed }) => [
              styles.micButton,
              isListening ? styles.micButtonListening : null,
              isSubmitting ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.micIcon}>{isListening ? '■' : '🎙'}</Text>
            <Text style={styles.micLabel}>{isListening ? 'Stop' : 'Speak'}</Text>
          </Pressable>

          {isListening ? (
            <Text style={styles.listeningText}>Listening… Speak your question now.</Text>
          ) : dictationHint ? (
            <Text style={styles.dictationHint}>
              Voice captured. Review the question, then tap Ask Ready Route.
            </Text>
          ) : null}

          {dictationError ? (
            <Text accessibilityRole="alert" style={styles.dictationError}>{dictationError}</Text>
          ) : null}

          {!result ? renderQuestionComposer() : null}

          {!result ? (
            <View style={styles.examples}>
              <Text style={styles.sectionLabel}>Try an example</Text>
              {EXAMPLE_QUESTIONS.map((example) => (
                <Pressable
                  key={example}
                  onPress={() => setQuestion(example)}
                  style={({ pressed }) => [styles.exampleChip, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.exampleText}>{example}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {isSubmitting && result ? (
            <View style={styles.verificationNotice}>
              <Text style={styles.verificationNoticeText}>
                Checking your follow-up. The answer below is from your previous question until verification finishes.
              </Text>
            </View>
          ) : null}

          {result?.response_mode === 'ANSWER' ? (
            <View style={styles.answerCard}>
              <Text maxFontSizeMultiplier={1.25} style={styles.answerEyebrow}>What to do now</Text>

              <View style={styles.stepList}>
                {answerStructure.steps.map((step, index) => (
                  <View key={`${index}-${step}`} style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text maxFontSizeMultiplier={1.2} style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <Text maxFontSizeMultiplier={1.35} style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>

              {answerStructure.options.length ? (
                <View style={styles.answerOptions}>
                  <Text style={styles.optionSectionTitle}>Choose what matches</Text>
                  {answerStructure.options.map((option) => {
                    const isExpanded = expandedOptionId === option.id;
                    return (
                      <Pressable
                        accessibilityLabel={`${option.label}. ${isExpanded ? 'Hide details' : 'Show details'}`}
                        accessibilityRole="button"
                        key={option.id}
                        onPress={() => setExpandedOptionId(isExpanded ? null : option.id)}
                        style={({ pressed }) => [
                          styles.answerOptionCard,
                          isExpanded ? styles.answerOptionCardExpanded : null,
                          pressed ? styles.pressed : null
                        ]}
                      >
                        <View style={styles.answerOptionHeader}>
                          <View style={styles.answerOptionCopy}>
                            <Text maxFontSizeMultiplier={1.3} style={styles.answerOptionLabel}>{option.label}</Text>
                            {option.summary ? (
                              <Text maxFontSizeMultiplier={1.35} style={styles.answerOptionSummary}>{option.summary}</Text>
                            ) : null}
                          </View>
                          <Text style={styles.answerOptionToggle}>{isExpanded ? '−' : '+'}</Text>
                        </View>
                        {isExpanded && Array.isArray(option.details) ? (
                          <View style={styles.answerOptionDetails}>
                            {option.details.map((detail, index) => (
                              <View key={`${option.id}-${index}`} style={styles.bulletRow}>
                                <Text style={styles.detailBullet}>{index + 1}.</Text>
                                <Text maxFontSizeMultiplier={1.35} style={styles.detailText}>{detail}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {answerStructure.prohibitedActions.length ? (
                <View style={styles.warningPanel}>
                  <Text maxFontSizeMultiplier={1.25} style={styles.warningTitle}>Do not</Text>
                  {answerStructure.prohibitedActions.slice(0, 3).map((item) => (
                    <View key={item} style={styles.bulletRow}>
                      <Text maxFontSizeMultiplier={1.2} style={styles.warningBullet}>•</Text>
                      <Text maxFontSizeMultiplier={1.35} style={styles.warningText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {result.more_info || answerStructure.procedureSteps.length || answerStructure.documentation.length || answerStructure.escalationRequirements.length ? (
                <>
                  <Pressable onPress={() => setShowMore((current) => !current)} style={styles.moreButton}>
                    <Text style={styles.moreButtonText}>{showMore ? 'Hide More Info' : 'More Info'}</Text>
                  </Pressable>
                  {showMore ? (
                    <View style={styles.moreContent}>
                      {result.more_info ? <Text maxFontSizeMultiplier={1.35} style={styles.moreText}>{result.more_info}</Text> : null}
                      {answerStructure.procedureSteps.length ? (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailTitle}>Full procedure</Text>
                          {answerStructure.procedureSteps.map((item, index) => (
                            <View key={item} style={styles.bulletRow}>
                              <Text style={styles.detailBullet}>{index + 1}.</Text>
                              <Text maxFontSizeMultiplier={1.35} style={styles.detailText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {answerStructure.documentation.length ? (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailTitle}>Documentation</Text>
                          {answerStructure.documentation.map((item) => (
                            <View key={item} style={styles.bulletRow}>
                              <Text style={styles.detailBullet}>•</Text>
                              <Text maxFontSizeMultiplier={1.35} style={styles.detailText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {answerStructure.escalationRequirements.length ? (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailTitle}>When to contact management</Text>
                          {answerStructure.escalationRequirements.map((item) => (
                            <View key={item} style={styles.bulletRow}>
                              <Text style={styles.detailBullet}>•</Text>
                              <Text maxFontSizeMultiplier={1.35} style={styles.detailText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : null}

              <View style={styles.traceRow}>
                <Text style={styles.traceText}>Verified procedure</Text>
                {result.trace?.[0] ? (
                  <Text style={styles.traceId}>
                    {result.trace[0].knowledge_id} v{result.trace[0].version}
                  </Text>
                ) : null}
              </View>

              <View style={styles.feedbackRow}>
                <Text style={styles.feedbackLabel}>Was this helpful?</Text>
                <Pressable
                  accessibilityLabel="Helpful answer"
                  onPress={() => submitFeedback('up')}
                  style={[styles.feedbackButton, feedback === 'up' ? styles.feedbackSelected : null]}
                >
                  <Text style={styles.feedbackText}>👍</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Unhelpful answer"
                  onPress={() => submitFeedback('down')}
                  style={[styles.feedbackButton, feedback === 'down' ? styles.feedbackSelected : null]}
                >
                  <Text style={styles.feedbackText}>👎</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {result?.response_mode === 'CLARIFY' ? (
            <View style={styles.clarifyCard}>
              <Text style={styles.answerEyebrow}>One detail first</Text>
              <Text style={styles.answerText}>{result.clarification_prompt}</Text>
              <View style={styles.optionList}>
                {(result.clarification_options || []).map((option) => (
                  <Pressable
                    key={`${option.knowledge_id}-${option.version}`}
                    onPress={() => chooseClarification(option)}
                    style={({ pressed }) => [styles.optionButton, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.optionText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              {!(result.clarification_options || []).length ? (
                <Text style={styles.clarificationHelp}>Answer this detail in your own words below.</Text>
              ) : null}
            </View>
          ) : null}

          {result?.response_mode === 'ESCALATE' ? (
            <View style={styles.escalationCard}>
              <Text style={styles.escalationEyebrow}>Approved answer unavailable</Text>
              <Text maxFontSizeMultiplier={1.35} style={styles.escalationText}>{result.escalation_message}</Text>
              {(result.escalation_details || []).length ? (
                <View style={styles.escalationChecklist}>
                  <Text style={styles.detailTitle}>Be ready to confirm</Text>
                  {result.escalation_details.map((item) => (
                    <View key={item} style={styles.bulletRow}>
                      <Text style={styles.detailBullet}>•</Text>
                      <Text maxFontSizeMultiplier={1.35} style={styles.detailText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.escalationNote}>
                This question has been logged so the knowledge gap can be reviewed.
              </Text>
            </View>
          ) : null}

          {result ? (
            <>
              <View style={styles.followUpHeader}>
                <Text style={styles.followUpHint}>
                  Ready Route will keep this situation in context.
                </Text>
                <Pressable
                  accessibilityLabel="Start a new situation"
                  accessibilityRole="button"
                  onPress={startNewSituation}
                  style={({ pressed }) => [styles.newSituationButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.newSituationText}>New situation</Text>
                </Pressable>
              </View>
              {renderQuestionComposer(
                result.response_mode === 'CLARIFY'
                  ? 'Answer the requested detail...'
                  : 'Ask a follow-up question...'
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: appTheme.colors.background, flex: 1 },
  keyboardView: { flex: 1 },
  content: { alignItems: 'center', paddingBottom: 48, paddingHorizontal: 18, paddingTop: 64 },
  hero: { alignItems: 'center', maxWidth: 620 },
  eyebrow: { color: appTheme.colors.orangeDeep, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: appTheme.colors.textPrimary, fontSize: 34, fontWeight: '900', marginTop: 8 },
  subtitle: { color: appTheme.colors.textSecondary, fontSize: 16, lineHeight: 23, marginTop: 10, textAlign: 'center' },
  micButton: { alignItems: 'center', backgroundColor: appTheme.colors.orange, borderRadius: 54, height: 108, justifyContent: 'center', marginTop: 28, shadowColor: appTheme.colors.orangeDeep, shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.22, shadowRadius: 18, width: 108 },
  micButtonListening: { backgroundColor: appTheme.colors.charcoal },
  micIcon: { color: appTheme.colors.white, fontSize: 28, lineHeight: 30 },
  micLabel: { color: appTheme.colors.white, fontSize: 14, fontWeight: '900', marginTop: 5 },
  listeningText: { color: appTheme.colors.orangeDeep, fontSize: 14, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  dictationHint: { color: appTheme.colors.textSecondary, fontSize: 13, marginTop: 10, textAlign: 'center' },
  dictationError: { color: appTheme.colors.danger, fontSize: 13, fontWeight: '700', marginTop: 10, maxWidth: 620, textAlign: 'center' },
  questionCard: { backgroundColor: appTheme.colors.surface, borderColor: appTheme.colors.border, borderRadius: 22, borderWidth: 1, marginTop: 22, maxWidth: 680, padding: 14, width: '100%', ...appTheme.shadows.card },
  input: { color: appTheme.colors.textPrimary, fontSize: 17, lineHeight: 24, minHeight: 82, padding: 8 },
  askButton: { alignItems: 'center', backgroundColor: appTheme.colors.charcoal, borderRadius: 17, height: 50, justifyContent: 'center', marginTop: 8 },
  askButtonText: { color: appTheme.colors.white, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  examples: { gap: 9, marginTop: 22, maxWidth: 680, width: '100%' },
  sectionLabel: { color: appTheme.colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  exampleChip: { backgroundColor: appTheme.colors.surface, borderColor: appTheme.colors.border, borderRadius: 16, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 13 },
  exampleText: { color: appTheme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  answerCard: { backgroundColor: appTheme.colors.surface, borderColor: appTheme.colors.green, borderRadius: 22, borderWidth: 1.5, marginTop: 22, maxWidth: 680, padding: 20, width: '100%', ...appTheme.shadows.card },
  clarifyCard: { backgroundColor: appTheme.colors.surface, borderColor: appTheme.colors.purple, borderRadius: 22, borderWidth: 1.5, marginTop: 22, maxWidth: 680, padding: 20, width: '100%' },
  escalationCard: { backgroundColor: appTheme.colors.warningSoft, borderColor: appTheme.colors.warning, borderRadius: 22, borderWidth: 1.5, marginTop: 22, maxWidth: 680, padding: 20, width: '100%' },
  answerEyebrow: { color: appTheme.colors.greenText, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  escalationEyebrow: { color: appTheme.colors.warningText, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  answerText: { color: appTheme.colors.textPrimary, fontSize: 18, fontWeight: '600', lineHeight: 27, marginTop: 10 },
  escalationText: { color: appTheme.colors.textPrimary, fontSize: 16, fontWeight: '600', lineHeight: 23, marginTop: 10 },
  escalationChecklist: { borderTopColor: appTheme.colors.divider, borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  stepList: { gap: 12, marginTop: 16 },
  stepRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  stepNumber: { alignItems: 'center', backgroundColor: appTheme.colors.greenSoft, borderRadius: 14, height: 28, justifyContent: 'center', marginTop: 1, width: 28 },
  stepNumberText: { color: appTheme.colors.greenText, fontSize: 14, fontWeight: '900' },
  stepText: { color: appTheme.colors.textPrimary, flex: 1, fontSize: 16, fontWeight: '600', lineHeight: 23 },
  answerOptions: { gap: 10, marginTop: 20 },
  optionSectionTitle: { color: appTheme.colors.textSecondary, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  answerOptionCard: { backgroundColor: appTheme.colors.surfaceMuted, borderColor: appTheme.colors.border, borderRadius: 16, borderWidth: 1, padding: 14 },
  answerOptionCardExpanded: { backgroundColor: appTheme.colors.infoSoft, borderColor: appTheme.colors.green },
  answerOptionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  answerOptionCopy: { flex: 1 },
  answerOptionLabel: { color: appTheme.colors.textPrimary, fontSize: 15, fontWeight: '900', lineHeight: 21 },
  answerOptionSummary: { color: appTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  answerOptionToggle: { color: appTheme.colors.greenText, fontSize: 24, fontWeight: '500', lineHeight: 25 },
  answerOptionDetails: { borderTopColor: appTheme.colors.divider, borderTopWidth: 1, marginTop: 12, paddingTop: 8 },
  warningPanel: { backgroundColor: appTheme.colors.warningSoft, borderColor: appTheme.colors.warning, borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 14 },
  warningTitle: { color: appTheme.colors.warningText, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, marginBottom: 6, textTransform: 'uppercase' },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 6 },
  warningBullet: { color: appTheme.colors.warningText, fontSize: 16, fontWeight: '900', lineHeight: 22 },
  warningText: { color: appTheme.colors.warningText, flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  moreButton: { alignSelf: 'flex-start', backgroundColor: appTheme.colors.infoSoft, borderRadius: 14, marginTop: 16, paddingHorizontal: 14, paddingVertical: 10 },
  moreButtonText: { color: appTheme.colors.textPrimary, fontSize: 14, fontWeight: '800' },
  moreContent: { gap: 14, marginTop: 14 },
  moreText: { color: appTheme.colors.textSecondary, fontSize: 15, lineHeight: 23 },
  detailSection: { borderTopColor: appTheme.colors.divider, borderTopWidth: 1, paddingTop: 12 },
  detailTitle: { color: appTheme.colors.textPrimary, fontSize: 13, fontWeight: '900' },
  detailBullet: { color: appTheme.colors.textSecondary, fontSize: 15, lineHeight: 22 },
  detailText: { color: appTheme.colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 21 },
  traceRow: { alignItems: 'center', borderTopColor: appTheme.colors.divider, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingTop: 14 },
  traceText: { color: appTheme.colors.greenText, fontSize: 12, fontWeight: '800' },
  traceId: { color: appTheme.colors.textTertiary, fontSize: 10, marginLeft: 10 },
  feedbackRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 16 },
  feedbackLabel: { color: appTheme.colors.textSecondary, flex: 1, fontSize: 13, fontWeight: '700' },
  feedbackButton: { alignItems: 'center', backgroundColor: appTheme.colors.surfaceMuted, borderColor: appTheme.colors.border, borderRadius: 14, borderWidth: 1, height: 42, justifyContent: 'center', width: 48 },
  feedbackSelected: { backgroundColor: appTheme.colors.orangeSoft, borderColor: appTheme.colors.orange },
  feedbackText: { fontSize: 19 },
  optionList: { gap: 9, marginTop: 16 },
  optionButton: { backgroundColor: appTheme.colors.purpleSoft, borderColor: appTheme.colors.purple, borderRadius: 15, borderWidth: 1, padding: 14 },
  optionText: { color: appTheme.colors.textPrimary, fontSize: 14, fontWeight: '700' },
  clarificationHelp: { color: appTheme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 12 },
  escalationNote: { color: appTheme.colors.warningText, fontSize: 13, lineHeight: 19, marginTop: 14 },
  followUpHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 18, maxWidth: 680, width: '100%' },
  followUpHint: { color: appTheme.colors.textSecondary, flex: 1, fontSize: 13, lineHeight: 18 },
  newSituationButton: { backgroundColor: appTheme.colors.surface, borderColor: appTheme.colors.border, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  newSituationText: { color: appTheme.colors.textPrimary, fontSize: 13, fontWeight: '800' },
  errorCard: { backgroundColor: appTheme.colors.dangerSoft, borderColor: appTheme.colors.danger, borderRadius: 16, borderWidth: 1, marginTop: 16, maxWidth: 680, padding: 14, width: '100%' },
  errorText: { color: appTheme.colors.dangerText, fontSize: 14, lineHeight: 20 },
  verificationNotice: { backgroundColor: appTheme.colors.warningSoft, borderColor: appTheme.colors.warning, borderRadius: 16, borderWidth: 1, marginTop: 16, maxWidth: 680, padding: 14, width: '100%' },
  verificationNoticeText: { color: appTheme.colors.warningText, fontSize: 14, fontWeight: '700', lineHeight: 20 }
});
