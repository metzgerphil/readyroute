import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent
} from 'expo-speech-recognition';

import VehicleBarcodeCard from '../components/VehicleBarcodeCard';
import api from '../services/api';
import appTheme from '../theme/appTheme';
import { getApiErrorMessage } from '../utils/apiError';

const BRAND_ORANGE = '#ff6200';
const BRAND_NAVY = '#173042';
const BRAND_BACKGROUND = '#f7f5f1';

export function shouldStartBackSwipe({ startX, dx, dy, hasResult, isSubmitting }) {
  return Boolean(
    hasResult
    && !isSubmitting
    && startX <= 40
    && dx > 18
    && Math.abs(dx) > Math.abs(dy) * 1.35
  );
}

export function shouldCompleteBackSwipe({ dx, vx }) {
  return dx >= 110 || (dx >= 70 && vx >= 0.25);
}

export function resetDriverHelpViewport(scrollReference, schedule = setTimeout) {
  return schedule(() => {
    scrollReference.current?.scrollTo({ animated: false, y: 0 });
  }, 0);
}

export function getImageModalSafeAreaPadding(insets = {}) {
  const top = Number(insets.top) || 0;
  const bottom = Number(insets.bottom) || 0;
  return {
    paddingBottom: Math.max(bottom, 16),
    paddingTop: Math.max(top + 8, 24)
  };
}

function MicrophoneIcon({ size = 50 }) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Path
        d="M24 29c4.42 0 8-3.58 8-8V10a8 8 0 0 0-16 0v11c0 4.42 3.58 8 8 8Z"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      <Path
        d="M10.5 21.5v1.5c0 7.46 6.04 13.5 13.5 13.5S37.5 30.46 37.5 23v-1.5"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <Line stroke="#ffffff" strokeLinecap="round" strokeWidth="4" x1="24" x2="24" y1="36.5" y2="43" />
      <Line stroke="#ffffff" strokeLinecap="round" strokeWidth="4" x1="17.5" x2="30.5" y1="43" y2="43" />
    </Svg>
  );
}

function SendIcon() {
  return (
    <Svg height={23} viewBox="0 0 24 24" width={23}>
      <Path
        d="m4 4 17 8-17 8 3.5-8L4 4Zm3.5 8H21"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

function StatusShieldIcon({ unavailable = false }) {
  return (
    <Svg height={unavailable ? 76 : 34} viewBox="0 0 48 56" width={unavailable ? 66 : 40}>
      <Path
        d="M24 2 43 10v15c0 13-7.7 23.2-19 29C12.7 48.2 5 38 5 25V10L24 2Z"
        fill={unavailable ? 'none' : BRAND_ORANGE}
        stroke={unavailable ? BRAND_NAVY : BRAND_ORANGE}
        strokeLinejoin="round"
        strokeWidth="3"
      />
      {unavailable ? (
        <>
          <Line stroke={BRAND_NAVY} strokeLinecap="round" strokeWidth="3" x1="24" x2="24" y1="19" y2="32" />
          <Line stroke={BRAND_NAVY} strokeLinecap="round" strokeWidth="3" x1="24" x2="24" y1="39" y2="39" />
        </>
      ) : (
        <Path
          d="m14 27 7 7 14-17"
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      )}
    </Svg>
  );
}

function splitAnswerIntoSteps(answer) {
  return (String(answer || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function getAnswerStructure(result) {
  const source = result?.answer_structure || {};
  const fallbackSentences = splitAnswerIntoSteps(result?.answer);
  const directAnswer = String(source.direct_answer || fallbackSentences[0] || result?.answer || '').trim();
  const steps = Array.isArray(source.steps) && source.steps.length
    ? source.steps.map(String).filter(Boolean)
    : fallbackSentences.slice(1);
  const prohibitedActions = Array.isArray(source.prohibited_actions)
    ? source.prohibited_actions.map(String).filter(Boolean)
    : [];
  return {
    directAnswer,
    steps,
    watchFor: String(source.watch_for || prohibitedActions[0] || '').trim(),
    options: Array.isArray(source.options) ? source.options.filter((option) => option?.id && option?.label) : [],
    procedureSteps: Array.isArray(source.procedure_steps) ? source.procedure_steps.map(String).filter(Boolean) : [],
    documentation: Array.isArray(source.documentation) ? source.documentation.map(String).filter(Boolean) : [],
    prohibitedActions,
    escalationRequirements: Array.isArray(source.escalation_requirements)
      ? source.escalation_requirements.map(String).filter(Boolean)
      : []
  };
}

export function getProminentCode(answerStructure = {}) {
  const answerText = [answerStructure.directAnswer, ...(answerStructure.steps || [])]
    .filter(Boolean)
    .join(' ');
  const codes = [...answerText.matchAll(/\b(?:status\s+)?code\s+(\d{1,3})\b/gi)]
    .map((match) => match[1]);
  const uniqueCodes = [...new Set(codes)];
  return uniqueCodes.length === 1 ? uniqueCodes[0] : null;
}

export default function DriverHelpScreen() {
  const safeAreaInsets = useContext(SafeAreaInsetsContext) || { bottom: 0, top: 0 };
  const inputRef = useRef(null);
  const inputFocusedRef = useRef(false);
  const historyRef = useRef([]);
  const scrollRef = useRef(null);
  const submittingRef = useRef(false);
  const [question, setQuestion] = useState('');
  const [situationQuestion, setSituationQuestion] = useState('');
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
  const [selectedClarificationKey, setSelectedClarificationKey] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const answerStructure = getAnswerStructure(result);
  const isVehicleBarcodeWorkflow = result?.answer_type === 'VEHICLE_BARCODE';
  const minimumQuestionLength = isVehicleBarcodeWorkflow && result?.response_mode === 'CLARIFY' ? 1 : 2;
  const prominentCode = isVehicleBarcodeWorkflow ? null : getProminentCode(answerStructure);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (inputFocusedRef.current) {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const timer = resetDriverHelpViewport(scrollRef);
    return () => clearTimeout(timer);
  }, [result]);

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
      const isFinalTranscript = event.isFinal === true || event.results?.[0]?.isFinal === true;
      setDictationHint(!isFinalTranscript);
      if (isFinalTranscript) {
        submitQuestion(transcript, { preserveSituation: Boolean(result) });
      }
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

  async function submitQuestion(nextQuestion = question, { preserveSituation = false } = {}) {
    const trimmedQuestion = String(nextQuestion || '').trim();
    if (trimmedQuestion.length < minimumQuestionLength || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    Keyboard.dismiss();

    const previousState = {
      expandedOptionId,
      feedback,
      question,
      result,
      sessionId,
      showMore,
      situationQuestion
    };

    setQuestion(trimmedQuestion);
    if (!preserveSituation || !situationQuestion) {
      setSituationQuestion(trimmedQuestion);
    }
    setIsSubmitting(true);
    setError('');
    setShowMore(false);
    setExpandedOptionId(null);
    setFeedback(null);
    setSelectedImage(null);

    try {
      const response = await api.post('/driver-help/query', {
        question: trimmedQuestion,
        ...(sessionId ? { session_id: sessionId } : {})
      });
      historyRef.current = [...historyRef.current, previousState];
      setSessionId(response.data?.session_id || sessionId);
      setResult(response.data || null);
      setQuestion('');
      setDictationHint(false);
    } catch (requestError) {
      const requestFailedBeforeVerification = requestError?.code === 'ECONNABORTED' || !requestError?.response;
      setError(requestFailedBeforeVerification
        ? 'Ready Route did not receive a confirmed answer. Check your connection and tap Ask Ready Route again. Contact your manager if you need an immediate answer.'
        : getApiErrorMessage(
          requestError,
          'Ready Route could not check the approved procedures right now. Contact your manager if you need an immediate answer.'
        ));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      setSelectedClarificationKey(null);
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
    if (followUp && !submittingRef.current) {
      setSelectedClarificationKey(`${option?.knowledge_id || 'option'}-${option?.version || 1}-${option?.label || followUp}`);
      submitQuestion(followUp, { preserveSituation: true });
    }
  }

  function chooseNotSure() {
    if (!submittingRef.current) {
      setSelectedClarificationKey('not-sure');
      submitQuestion("I'm not sure.", { preserveSituation: true });
    }
  }

  function startNewSituation() {
    Keyboard.dismiss();
    historyRef.current = [];
    setSessionId(null);
    setResult(null);
    setSituationQuestion('');
    setQuestion('');
    setShowMore(false);
    setExpandedOptionId(null);
    setFeedback(null);
    setSelectedImage(null);
    setError('');
    setDictationError('');
    setDictationHint(false);
    resetDriverHelpViewport(scrollRef);
  }

  function goBack() {
    if (isSubmitting) {
      return;
    }

    const previousState = historyRef.current.at(-1);
    if (!previousState) {
      startNewSituation();
      return;
    }

    historyRef.current = historyRef.current.slice(0, -1);
    setExpandedOptionId(previousState.expandedOptionId);
    setFeedback(previousState.feedback);
    setSelectedImage(null);
    setQuestion(previousState.question);
    setResult(previousState.result);
    setSessionId(previousState.sessionId);
    setShowMore(previousState.showMore);
    setSituationQuestion(previousState.situationQuestion);
    setError('');
    setDictationError('');
    setDictationHint(false);
    resetDriverHelpViewport(scrollRef);
  }

  const backSwipeResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(result) && !isSubmitting,
    onMoveShouldSetPanResponder: () => Boolean(result) && !isSubmitting,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_event, gestureState) => {
      if (shouldCompleteBackSwipe({ dx: gestureState.dx, vx: gestureState.vx })) {
        goBack();
      }
    }
  });

  function renderQuestionComposer(
    placeholder = 'Type your question',
    { preserveSituation = false, showMicrophone = false } = {}
  ) {
    return (
      <View style={styles.questionComposer}>
        <TextInput
          accessibilityLabel="Driver question"
          blurOnSubmit={false}
          maxLength={500}
          multiline
          onChangeText={(value) => {
            setQuestion(value);
            setError('');
          }}
          onBlur={() => {
            inputFocusedRef.current = false;
          }}
          onFocus={() => {
            inputFocusedRef.current = true;
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
          }}
          onSubmitEditing={() => submitQuestion(question, { preserveSituation })}
          placeholder={placeholder}
          placeholderTextColor={appTheme.colors.textTertiary}
          ref={inputRef}
          returnKeyType="send"
          style={styles.input}
          textAlignVertical="center"
          value={question}
        />
        {showMicrophone ? (
          <Pressable
            accessibilityHint={isListening ? 'Stops speech recognition' : 'Starts speech recognition'}
            accessibilityLabel={isListening ? 'Stop listening' : 'Speak a follow-up question'}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={toggleDictation}
            style={({ pressed }) => [
              styles.followUpMicButton,
              isListening ? styles.followUpMicButtonListening : null,
              isSubmitting ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            {isListening ? <View style={styles.smallStopIcon} /> : <MicrophoneIcon size={22} />}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Ask Ready Route"
          disabled={question.trim().length < minimumQuestionLength || isSubmitting}
          onPress={() => submitQuestion(question, { preserveSituation })}
          style={({ pressed }) => [
            styles.sendButton,
            (question.trim().length < minimumQuestionLength || isSubmitting) ? styles.disabled : null,
            pressed && question.trim().length >= minimumQuestionLength && !isSubmitting ? styles.pressed : null
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={appTheme.colors.white} />
          ) : (
            <SendIcon />
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
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.brandRow, result ? styles.brandRowCompact : null]}>
            {result ? (
              <Pressable
                accessibilityHint="Returns to the previous Ready Route screen"
                accessibilityLabel="Go back"
                accessibilityRole="button"
                disabled={isSubmitting}
                hitSlop={10}
                onPress={goBack}
                style={({ pressed }) => [
                  styles.backButton,
                  isSubmitting ? styles.disabled : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={styles.backButtonText}>‹ Back</Text>
              </Pressable>
            ) : null}
            <Text accessibilityRole="header" style={styles.wordmark}>
              ready<Text style={styles.wordmarkAccent}>Route</Text>
            </Text>
          </View>

          {!result ? (
            <View style={styles.homeHero}>
              <Text style={styles.title}>What do you need help with?</Text>
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
                {isListening ? <View style={styles.stopIcon} /> : <MicrophoneIcon />}
              </Pressable>
              <Text style={styles.micLabel}>{isListening ? 'Tap to stop' : 'Tap to ask'}</Text>
            </View>
          ) : null}

          {isListening ? (
            <Text style={styles.listeningText}>Listening… Speak your question now.</Text>
          ) : dictationHint ? (
            <Text style={styles.dictationHint}>
              Voice captured. Review it, then tap send.
            </Text>
          ) : null}

          {dictationError ? (
            <Text accessibilityRole="alert" style={styles.dictationError}>{dictationError}</Text>
          ) : null}

          {!result ? renderQuestionComposer() : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {isSubmitting && result ? (
            <View style={styles.verificationNotice}>
              <Text style={styles.verificationNoticeText}>
                Checking your follow-up. The answer below is from your previous question until the new answer is ready.
              </Text>
            </View>
          ) : null}

          {result && situationQuestion ? (
            <View accessibilityLabel={`Current question: ${situationQuestion}`} style={styles.querySummary}>
              <View style={styles.queryAccent} />
              <Text maxFontSizeMultiplier={1.25} numberOfLines={3} style={styles.querySummaryText}>
                {situationQuestion}
              </Text>
            </View>
          ) : null}

          {result?.response_mode === 'ANSWER' ? (
            <View style={styles.answerCard}>
              {prominentCode ? (
                <View accessibilityLabel={`Use code ${prominentCode}`} style={styles.codeBanner}>
                  <Text maxFontSizeMultiplier={1.25} style={styles.codeBannerText}>USE CODE {prominentCode}</Text>
                </View>
              ) : null}
              <Text maxFontSizeMultiplier={1.35} style={styles.directAnswerText}>{answerStructure.directAnswer}</Text>

              {result.barcode ? <VehicleBarcodeCard barcode={result.barcode} /> : null}

              {answerStructure.steps.length ? (
                <>
                  <Text maxFontSizeMultiplier={1.25} style={styles.doThisHeading}>What to do</Text>
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
                </>
              ) : null}

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

              {(result.images || []).length ? (
                <View style={styles.visualReferenceSection}>
                  <Text style={styles.visualReferenceTitle}>Visual reference</Text>
                  <Text style={styles.visualReferenceNote}>Follow the written procedure above.</Text>
                  {(result.images || []).map((image, index) => {
                    const label = image.caption || `Visual reference ${index + 1}`;
                    return (
                      <Pressable
                        accessibilityHint="Opens the image full screen"
                        accessibilityLabel={`Open image: ${label}`}
                        accessibilityRole="imagebutton"
                        key={`${image.filename || image.url}-${index}`}
                        onPress={() => setSelectedImage(image)}
                        style={({ pressed }) => [styles.answerImageCard, pressed ? styles.pressed : null]}
                      >
                        <Image
                          accessibilityLabel={label}
                          resizeMode="contain"
                          source={{ uri: image.url }}
                          style={styles.answerImage}
                        />
                        {image.caption ? <Text style={styles.answerImageCaption}>{image.caption}</Text> : null}
                        <Text style={styles.answerImageHint}>Tap to enlarge</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {answerStructure.watchFor ? (
                <View style={styles.warningPanel}>
                  <Text maxFontSizeMultiplier={1.25} style={styles.warningTitle}>Watch for</Text>
                  <Text maxFontSizeMultiplier={1.35} style={styles.warningText}>{answerStructure.watchFor}</Text>
                </View>
              ) : null}

              {result.more_info || answerStructure.procedureSteps.length || answerStructure.documentation.length || answerStructure.prohibitedActions.length || answerStructure.escalationRequirements.length ? (
                <>
                  <Pressable accessibilityRole="button" onPress={() => setShowMore((current) => !current)} style={styles.moreButton}>
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
                      {answerStructure.prohibitedActions.length ? (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailTitle}>Important restrictions</Text>
                          {answerStructure.prohibitedActions.map((item) => (
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

              <View style={styles.feedbackRow}>
                <Text style={styles.feedbackLabel}>Was this helpful?</Text>
              </View>
              <View style={styles.feedbackButtons}>
                <Pressable
                  accessibilityLabel="Helpful answer"
                  onPress={() => submitFeedback('up')}
                  style={[styles.feedbackButton, feedback === 'up' ? styles.feedbackSelected : null]}
                >
                  <Text style={styles.feedbackText}>Helpful</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Unhelpful answer"
                  onPress={() => submitFeedback('down')}
                  style={[styles.feedbackButton, feedback === 'down' ? styles.feedbackSelected : null]}
                >
                  <Text style={styles.feedbackText}>Not Helpful</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {result?.response_mode === 'CLARIFY' ? (
            <View style={styles.clarifyCard}>
              <View style={styles.clarifyHeadingRow}>
                <View style={styles.questionMark}><Text style={styles.questionMarkText}>?</Text></View>
                <Text style={styles.clarifyEyebrow}>One detail first</Text>
              </View>
              <Text style={styles.clarificationPrompt}>{result.clarification_prompt}</Text>
              {!isVehicleBarcodeWorkflow ? <View style={styles.optionList}>
                {(result.clarification_options || []).map((option) => {
                  const optionKey = `${option?.knowledge_id || 'option'}-${option?.version || 1}-${option?.label || option?.query}`;
                  const isSelected = selectedClarificationKey === optionKey;
                  return (
                    <Pressable
                      accessibilityLabel={option.label}
                      accessibilityRole="button"
                      disabled={isSubmitting}
                      key={optionKey}
                      onPress={() => chooseClarification(option)}
                      style={({ pressed }) => [
                        styles.optionButton,
                        isSelected ? styles.optionButtonSelected : null,
                        isSubmitting && !isSelected ? styles.disabled : null,
                        pressed && !isSubmitting ? styles.pressed : null
                      ]}
                    >
                      {isSelected && isSubmitting ? <ActivityIndicator color={BRAND_ORANGE} size="small" /> : null}
                      <Text style={styles.optionText}>{isSelected && isSubmitting ? 'Checking…' : option.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityLabel="Not sure"
                  disabled={isSubmitting}
                  onPress={chooseNotSure}
                  style={({ pressed }) => [
                    styles.optionButton,
                    styles.notSureButton,
                    selectedClarificationKey === 'not-sure' ? styles.optionButtonSelected : null,
                    pressed && !isSubmitting ? styles.pressed : null
                  ]}
                >
                  {selectedClarificationKey === 'not-sure' && isSubmitting ? (
                    <ActivityIndicator color={BRAND_ORANGE} size="small" />
                  ) : null}
                  <Text style={styles.notSureText}>
                    {selectedClarificationKey === 'not-sure' && isSubmitting ? 'Checking…' : 'Not sure'}
                  </Text>
                </Pressable>
              </View> : null}
              {!(result.clarification_options || []).length ? (
                <Text style={styles.clarificationHelp}>
                  {isVehicleBarcodeWorkflow
                    ? 'Enter the vehicle number below.'
                    : 'Answer this detail in your own words below.'}
                </Text>
              ) : null}
            </View>
          ) : null}

          {result?.response_mode === 'ESCALATE' ? (
            <View style={styles.escalationCard}>
              <View style={styles.unavailableIcon}><StatusShieldIcon unavailable /></View>
              <Text style={styles.escalationEyebrow}>Answer unavailable</Text>
              <Text maxFontSizeMultiplier={1.35} style={styles.escalationText}>
                Ready Route does not have enough confirmed information to give a definitive answer for this situation.
              </Text>
              <View style={styles.nextStepPanel}>
                <Text style={styles.nextStepTitle}>Next step</Text>
                <Text maxFontSizeMultiplier={1.35} style={styles.nextStepText}>{result.escalation_message}</Text>
                <View style={styles.nextStepDivider} />
                <Text style={styles.noGuessText}>Ready Route will not guess.</Text>
              </View>
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
            </View>
          ) : null}

          {result ? (
            <View style={styles.followUpSection}>
              <Text style={styles.followUpLabel}>
                {isVehicleBarcodeWorkflow && result.response_mode === 'CLARIFY'
                  ? 'Enter vehicle number'
                  : result.response_mode === 'CLARIFY'
                    ? 'Answer this detail'
                    : 'Ask about this answer'}
              </Text>
              {renderQuestionComposer(
                isVehicleBarcodeWorkflow && result.response_mode === 'CLARIFY'
                  ? 'Vehicle number'
                  : result.response_mode === 'CLARIFY'
                  ? 'Answer this detail'
                  : 'Ask a follow-up question',
                { preserveSituation: true, showMicrophone: true }
              )}
              <Pressable
                accessibilityLabel="Start a new question"
                accessibilityRole="button"
                onPress={startNewSituation}
                style={({ pressed }) => [styles.newSituationButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.newSituationText}>Start a New Question</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {result ? (
        <View
          {...backSwipeResponder.panHandlers}
          accessibilityHint="Swipe right to return to the previous Ready Route screen"
          accessibilityLabel="Swipe back"
          style={styles.backSwipeEdge}
        />
      ) : null}
      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
        presentationStyle="overFullScreen"
        transparent
        visible={Boolean(selectedImage)}
      >
        <View
          style={[styles.imageModal, getImageModalSafeAreaPadding(safeAreaInsets)]}
          testID="image-modal-surface"
        >
          <View style={styles.imageModalHeader}>
            <Text numberOfLines={2} style={styles.imageModalCaption}>{selectedImage?.caption || 'Visual reference'}</Text>
            <Pressable
              accessibilityLabel="Close image"
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setSelectedImage(null)}
              style={({ pressed }) => [styles.imageModalClose, pressed ? styles.pressed : null]}
            >
              <Text style={styles.imageModalCloseText}>Close</Text>
            </Pressable>
          </View>
          {selectedImage?.url ? (
            <Image
              accessibilityLabel={selectedImage.caption || 'Expanded visual reference'}
              resizeMode="contain"
              source={{ uri: selectedImage.url }}
              style={styles.imageModalAsset}
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: BRAND_BACKGROUND, flex: 1 },
  keyboardView: { flex: 1 },
  backSwipeEdge: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 28, zIndex: 20 },
  content: { alignItems: 'center', flexGrow: 1, paddingBottom: 48, paddingHorizontal: 20, paddingTop: 48 },
  brandRow: { alignItems: 'center', maxWidth: 680, minHeight: 46, width: '100%' },
  brandRowCompact: { minHeight: 38 },
  backButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', left: 0, minHeight: 44, minWidth: 66, position: 'absolute', top: -3, zIndex: 2 },
  backButtonText: { color: BRAND_NAVY, fontSize: 17, fontWeight: '800' },
  wordmark: { color: BRAND_NAVY, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  wordmarkAccent: { color: BRAND_ORANGE, fontWeight: '500' },
  homeHero: { alignItems: 'center', maxWidth: 620, paddingTop: 42, width: '100%' },
  title: { color: BRAND_NAVY, fontSize: 30, fontWeight: '900', lineHeight: 36, maxWidth: 520, textAlign: 'center' },
  micButton: { alignItems: 'center', backgroundColor: BRAND_ORANGE, borderColor: '#ffffff', borderRadius: 82, borderWidth: 5, height: 164, justifyContent: 'center', marginTop: 38, shadowColor: '#d45400', shadowOffset: { height: 10, width: 0 }, shadowOpacity: 0.24, shadowRadius: 22, width: 164 },
  micButtonListening: { backgroundColor: BRAND_NAVY, shadowColor: BRAND_NAVY },
  stopIcon: { backgroundColor: '#ffffff', borderRadius: 5, height: 38, width: 38 },
  micLabel: { color: BRAND_NAVY, fontSize: 18, fontWeight: '800', marginTop: 18 },
  listeningText: { color: appTheme.colors.orangeDeep, fontSize: 14, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  dictationHint: { color: appTheme.colors.textSecondary, fontSize: 13, marginTop: 10, textAlign: 'center' },
  dictationError: { color: appTheme.colors.danger, fontSize: 13, fontWeight: '700', marginTop: 10, maxWidth: 620, textAlign: 'center' },
  questionComposer: { alignItems: 'center', backgroundColor: appTheme.colors.surface, borderColor: '#dde5eb', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 32, maxWidth: 680, minHeight: 64, paddingHorizontal: 8, paddingVertical: 7, width: '100%', ...appTheme.shadows.card },
  input: { color: BRAND_NAVY, flex: 1, fontSize: 17, lineHeight: 23, maxHeight: 112, minHeight: 48, paddingHorizontal: 10, paddingVertical: 8 },
  followUpMicButton: { alignItems: 'center', backgroundColor: BRAND_ORANGE, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  followUpMicButtonListening: { backgroundColor: BRAND_NAVY },
  smallStopIcon: { backgroundColor: '#ffffff', borderRadius: 3, height: 17, width: 17 },
  sendButton: { alignItems: 'center', backgroundColor: BRAND_ORANGE, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  querySummary: { alignItems: 'center', backgroundColor: appTheme.colors.surface, borderColor: '#dde5eb', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 14, marginTop: 20, maxWidth: 680, minHeight: 72, paddingHorizontal: 16, paddingVertical: 14, width: '100%', ...appTheme.shadows.card },
  queryAccent: { backgroundColor: BRAND_ORANGE, borderRadius: 3, height: 30, width: 6 },
  querySummaryText: { color: BRAND_NAVY, flex: 1, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  answerCard: { backgroundColor: appTheme.colors.surface, borderColor: '#dde5eb', borderRadius: 22, borderWidth: 1, marginTop: 16, maxWidth: 680, padding: 20, width: '100%', ...appTheme.shadows.card },
  clarifyCard: { backgroundColor: appTheme.colors.surface, borderColor: '#dde5eb', borderRadius: 22, borderWidth: 1, marginTop: 16, maxWidth: 680, padding: 20, width: '100%', ...appTheme.shadows.card },
  escalationCard: { alignItems: 'stretch', backgroundColor: appTheme.colors.surface, borderColor: '#dde5eb', borderRadius: 22, borderWidth: 1, marginTop: 16, maxWidth: 680, padding: 20, width: '100%', ...appTheme.shadows.card },
  codeBanner: { alignItems: 'center', backgroundColor: BRAND_NAVY, borderRadius: 15, marginBottom: 16, paddingHorizontal: 18, paddingVertical: 15 },
  codeBannerText: { color: '#ffffff', fontSize: 21, fontWeight: '900', letterSpacing: 0.8 },
  directAnswerText: { color: BRAND_NAVY, fontSize: 22, fontWeight: '900', lineHeight: 29 },
  doThisHeading: { color: appTheme.colors.textSecondary, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, marginTop: 22, textTransform: 'uppercase' },
  clarifyHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  questionMark: { alignItems: 'center', backgroundColor: BRAND_ORANGE, borderRadius: 15, height: 30, justifyContent: 'center', width: 30 },
  questionMarkText: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  clarifyEyebrow: { color: BRAND_ORANGE, fontSize: 14, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  clarificationPrompt: { color: BRAND_NAVY, fontSize: 22, fontWeight: '900', lineHeight: 29, marginTop: 17 },
  unavailableIcon: { alignItems: 'center', marginBottom: 10 },
  escalationEyebrow: { color: BRAND_NAVY, fontSize: 18, fontWeight: '900', letterSpacing: 0.4, textAlign: 'center', textTransform: 'uppercase' },
  escalationText: { color: appTheme.colors.textSecondary, fontSize: 16, fontWeight: '600', lineHeight: 24, marginTop: 12, textAlign: 'center' },
  nextStepPanel: { backgroundColor: BRAND_NAVY, borderRadius: 16, marginTop: 20, padding: 18 },
  nextStepTitle: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  nextStepText: { color: '#ffffff', fontSize: 16, fontWeight: '700', lineHeight: 24, marginTop: 10 },
  nextStepDivider: { backgroundColor: 'rgba(255,255,255,0.24)', height: 1, marginVertical: 16 },
  noGuessText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  escalationChecklist: { borderTopColor: appTheme.colors.divider, borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  stepList: { gap: 12, marginTop: 16 },
  stepRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  stepNumber: { alignItems: 'center', backgroundColor: BRAND_ORANGE, borderRadius: 14, height: 28, justifyContent: 'center', marginTop: 1, width: 28 },
  stepNumberText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
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
  visualReferenceSection: { borderTopColor: appTheme.colors.divider, borderTopWidth: 1, gap: 10, marginTop: 20, paddingTop: 16 },
  visualReferenceTitle: { color: BRAND_NAVY, fontSize: 13, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  visualReferenceNote: { color: appTheme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  answerImageCard: { backgroundColor: appTheme.colors.surfaceMuted, borderColor: appTheme.colors.border, borderRadius: 16, borderWidth: 1, overflow: 'hidden', padding: 10 },
  answerImage: { backgroundColor: '#ffffff', borderRadius: 10, height: 260, width: '100%' },
  answerImageCaption: { color: appTheme.colors.textPrimary, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 9 },
  answerImageHint: { color: BRAND_ORANGE, fontSize: 11, fontWeight: '900', marginTop: 5, textTransform: 'uppercase' },
  imageModal: { backgroundColor: 'rgba(8, 20, 31, 0.97)', flex: 1, paddingHorizontal: 16 },
  imageModalHeader: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between', minHeight: 52 },
  imageModalCaption: { color: '#ffffff', flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  imageModalClose: { borderColor: '#ffffff', borderRadius: 14, borderWidth: 1, minHeight: 48, minWidth: 92, paddingHorizontal: 16, paddingVertical: 10, zIndex: 2 },
  imageModalCloseText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  imageModalAsset: { flex: 1, marginTop: 12, width: '100%' },
  warningPanel: { backgroundColor: appTheme.colors.warningSoft, borderColor: appTheme.colors.warning, borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 14 },
  warningTitle: { color: appTheme.colors.warningText, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, marginBottom: 6, textTransform: 'uppercase' },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 6 },
  warningBullet: { color: appTheme.colors.warningText, fontSize: 16, fontWeight: '900', lineHeight: 22 },
  warningText: { color: appTheme.colors.warningText, flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  moreButton: { alignItems: 'center', borderColor: BRAND_ORANGE, borderRadius: 14, borderWidth: 1.5, marginTop: 18, paddingHorizontal: 14, paddingVertical: 13, width: '100%' },
  moreButtonText: { color: BRAND_ORANGE, fontSize: 14, fontWeight: '900', textTransform: 'uppercase' },
  moreContent: { backgroundColor: appTheme.colors.surfaceTint, borderColor: appTheme.colors.orangeBorder, borderRadius: 14, borderWidth: 1, gap: 14, marginTop: 14, padding: 14 },
  moreText: { color: appTheme.colors.textSecondary, fontSize: 15, lineHeight: 23 },
  detailSection: { borderTopColor: appTheme.colors.divider, borderTopWidth: 1, paddingTop: 12 },
  detailTitle: { color: appTheme.colors.textPrimary, fontSize: 13, fontWeight: '900' },
  detailBullet: { color: appTheme.colors.textSecondary, fontSize: 15, lineHeight: 22 },
  detailText: { color: appTheme.colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 21 },
  feedbackRow: { marginTop: 18 },
  feedbackLabel: { color: BRAND_NAVY, fontSize: 14, fontWeight: '700' },
  feedbackButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  feedbackButton: { alignItems: 'center', backgroundColor: appTheme.colors.surfaceMuted, borderColor: appTheme.colors.border, borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: 10 },
  feedbackSelected: { backgroundColor: appTheme.colors.orangeSoft, borderColor: appTheme.colors.orange },
  feedbackText: { color: appTheme.colors.textSecondary, fontSize: 14, fontWeight: '800' },
  optionList: { gap: 9, marginTop: 16 },
  optionButton: { alignItems: 'center', backgroundColor: appTheme.colors.surface, borderColor: appTheme.colors.borderStrong, borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 58, justifyContent: 'center', padding: 14 },
  optionButtonSelected: { backgroundColor: appTheme.colors.orangeSoft, borderColor: BRAND_ORANGE },
  optionText: { color: appTheme.colors.textPrimary, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  notSureButton: { borderStyle: 'dashed' },
  notSureText: { color: appTheme.colors.textTertiary, fontSize: 15, fontWeight: '800' },
  clarificationHelp: { color: appTheme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 12 },
  followUpSection: { marginTop: 22, maxWidth: 680, width: '100%' },
  followUpLabel: { color: BRAND_NAVY, fontSize: 17, fontWeight: '900' },
  newSituationButton: { alignItems: 'center', borderColor: BRAND_NAVY, borderRadius: 14, borderWidth: 1.5, marginTop: 14, paddingHorizontal: 14, paddingVertical: 13 },
  newSituationText: { color: BRAND_NAVY, fontSize: 14, fontWeight: '900' },
  errorCard: { backgroundColor: appTheme.colors.dangerSoft, borderColor: appTheme.colors.danger, borderRadius: 16, borderWidth: 1, marginTop: 16, maxWidth: 680, padding: 14, width: '100%' },
  errorText: { color: appTheme.colors.dangerText, fontSize: 14, lineHeight: 20 },
  verificationNotice: { backgroundColor: appTheme.colors.warningSoft, borderColor: appTheme.colors.warning, borderRadius: 16, borderWidth: 1, marginTop: 16, maxWidth: 680, padding: 14, width: '100%' },
  verificationNoticeText: { color: appTheme.colors.warningText, fontSize: 14, fontWeight: '700', lineHeight: 20 }
});
