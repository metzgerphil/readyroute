import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import DriverHelpScreen, {
  getImageModalSafeAreaPadding,
  resetDriverHelpViewport,
  shouldCompleteBackSwipe,
  shouldStartBackSwipe
} from './DriverHelpScreen';
import api from '../services/api';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import bwipjs from '@bwip-js/react-native';

const mockSpeechHandlers = {};

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  },
  useSpeechRecognitionEvent: jest.fn((eventName, handler) => {
    mockSpeechHandlers[eventName] = handler;
  })
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  }
}));

jest.mock('@bwip-js/react-native', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn() }
}), { virtual: true });

describe('DriverHelpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockSpeechHandlers).forEach((key) => delete mockSpeechHandlers[key]);
    bwipjs.toDataURL.mockResolvedValue({
      uri: 'data:image/png;base64,vehicle-barcode',
      width: 420,
      height: 180
    });
  });

  it('keeps the vehicle-barcode workflow in the conversation and renders the encoded value', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'vehicle-session',
          interaction_id: 'vehicle-question',
          response_mode: 'CLARIFY',
          answer_type: 'VEHICLE_BARCODE',
          clarification_prompt: 'What is the vehicle number?',
          clarification_options: []
        }
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'vehicle-session',
          interaction_id: 'vehicle-answer',
          response_mode: 'ANSWER',
          answer_type: 'VEHICLE_BARCODE',
          answer: 'Scan this vehicle barcode.',
          answer_structure: {
            direct_answer: 'Scan this vehicle barcode.',
            steps: []
          },
          barcode: { symbology: 'CODE128', value: 'V400770' },
          trace: [{ knowledge_id: 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001', version: 2 }]
        }
      });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Can you create a barcode for me?');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('What is the vehicle number?')).toBeTruthy();
    expect(screen.getByText('Enter vehicle number')).toBeTruthy();
    expect(screen.queryByText('Not sure')).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Driver question'), '400770');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('V400770')).toBeTruthy();
    expect(screen.getByText('CODE 128')).toBeTruthy();
    expect(screen.getByTestId('vehicle-barcode-image')).toBeTruthy();
    expect(screen.queryByText('USE CODE 128')).toBeNull();
    expect(api.post).toHaveBeenLastCalledWith('/driver-help/query', {
      question: '400770',
      session_id: 'vehicle-session'
    });
    expect(bwipjs.toDataURL).toHaveBeenCalledWith(expect.objectContaining({
      bcid: 'code128',
      text: 'V400770'
    }));
  });

  it('keeps the image viewer controls below the device safe area', () => {
    expect(getImageModalSafeAreaPadding({ top: 59, bottom: 34 })).toEqual({
      paddingBottom: 34,
      paddingTop: 67
    });
    expect(getImageModalSafeAreaPadding({ top: 0, bottom: 0 })).toEqual({
      paddingBottom: 16,
      paddingTop: 24
    });
  });

  it('keeps the V1 home screen focused on one voice-or-text question', () => {
    const screen = render(<DriverHelpScreen />);

    expect(screen.getByText('What do you need help with?')).toBeTruthy();
    expect(screen.getByText('Tap to ask')).toBeTruthy();
    expect(screen.getByPlaceholderText('Type your question')).toBeTruthy();
    expect(screen.queryByText('Route Tools')).toBeNull();
    expect(screen.queryByText('Code Reference')).toBeNull();
    expect(screen.queryByText('Try an example')).toBeNull();
    expect(screen.queryByText('What happened?')).toBeNull();
  });

  it('starts native speech recognition and submits the final transcript automatically', async () => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'voice-session',
        interaction_id: 'voice-interaction',
        response_mode: 'ANSWER',
        answer: 'Use the verified signature procedure.',
        trace: [{ knowledge_id: 'KNO-DEL-SIG-DSR-001', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.press(screen.getByLabelText('Speak a question'));

    await waitFor(() => {
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith({
        continuous: false,
        interimResults: true,
        iosTaskHint: 'dictation',
        lang: 'en-US',
        maxAlternatives: 1
      });
    });

    act(() => mockSpeechHandlers.start());
    expect(screen.getByText('Listening… Speak your question now.')).toBeTruthy();

    act(() => mockSpeechHandlers.result({
      isFinal: true,
      results: [{ transcript: 'Signature package nobody home' }]
    }));
    act(() => mockSpeechHandlers.end());
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/driver-help/query', {
        question: 'Signature package nobody home'
      });
      expect(screen.getByText('Use the verified signature procedure.')).toBeTruthy();
    });
  });

  it('keeps the original situation when a driver speaks a follow-up question', async () => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'follow-up-session',
          interaction_id: 'first-interaction',
          response_mode: 'ANSWER',
          answer: 'Use Code 004 for this situation.',
          trace: [{ knowledge_id: 'KNO-CODE-004', version: 1 }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'follow-up-session',
          interaction_id: 'follow-up-interaction',
          response_mode: 'ANSWER',
          answer: 'Complete the required documentation.',
          trace: [{ knowledge_id: 'KNO-CODE-004', version: 1 }]
        }
      });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'The business is closed');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    await screen.findByText('Use Code 004 for this situation.');

    fireEvent.press(screen.getByLabelText('Speak a follow-up question'));
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());
    act(() => mockSpeechHandlers.result({
      isFinal: true,
      results: [{ transcript: 'What documentation do I need?' }]
    }));

    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith('/driver-help/query', {
        question: 'What documentation do I need?',
        session_id: 'follow-up-session'
      });
      expect(screen.getByLabelText('Current question: The business is closed')).toBeTruthy();
    });
  });

  it('explains how to recover when speech permission is denied', async () => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    const screen = render(<DriverHelpScreen />);

    fireEvent.press(screen.getByLabelText('Speak a question'));

    expect(await screen.findByText(
      'Microphone or speech recognition access is required. Enable both for ReadyRoute in iPhone Settings.'
    )).toBeTruthy();
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it('submits a driver question and renders a direct answer without internal traceability', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-1',
        interaction_id: 'interaction-1',
        response_mode: 'ANSWER',
        answer: 'Do not leave the package without the required signature.',
        more_info: 'Complete the approved unsuccessful-attempt procedure.',
        trace: [{ knowledge_id: 'KNO-DEL-SIG-DSR-001', version: 2 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Signature package nobody home');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/driver-help/query', {
        question: 'Signature package nobody home'
      });
      expect(screen.getByLabelText('Current question: Signature package nobody home')).toBeTruthy();
      expect(screen.getByText('Do not leave the package without the required signature.')).toBeTruthy();
      expect(screen.queryByText('Verified procedure')).toBeNull();
      expect(screen.queryByText('KNO-DEL-SIG-DSR-001 v2')).toBeNull();
      expect(screen.getByText('Ask about this answer')).toBeTruthy();
      expect(screen.getByText('Start a New Question')).toBeTruthy();
    });
  });

  it('makes one applicable code prominent', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-code',
        interaction_id: 'interaction-code',
        response_mode: 'ANSWER',
        answer_structure: {
          direct_answer: 'Use Code 004 because the business is closed.',
          steps: ['Select Code 004 in FORGE.', 'Complete the required documentation.']
        },
        trace: [{ knowledge_id: 'KNO-CODE-004', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Business is closed');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('USE CODE 004')).toBeTruthy();
    expect(screen.getByText('What to do')).toBeTruthy();
    expect(screen.getByLabelText('Use code 004')).toBeTruthy();
  });

  it('does not show one prominent code when the answer has conditional code paths', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-multiple-codes',
        interaction_id: 'interaction-multiple-codes',
        response_mode: 'ANSWER',
        answer_structure: {
          direct_answer: 'Use Code 011 for one condition or Code 004 when the business is closed.',
          steps: []
        },
        trace: [{ knowledge_id: 'KNO-MULTIPLE-CODES', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Which code applies?');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('Use Code 011 for one condition or Code 004 when the business is closed.')).toBeTruthy();
    expect(screen.queryByText(/^USE CODE/)).toBeNull();
  });

  it('renders operational answers as numbered steps with separate prohibitions', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-steps',
        interaction_id: 'interaction-steps',
        response_mode: 'ANSWER',
        answer: 'A long fallback answer.',
        answer_structure: {
          direct_answer: 'Use the verified signature procedure.',
          steps: ['Confirm the signature type.', 'Complete the applicable attempt procedure.'],
          watch_for: 'Do not leave a restricted package.',
          prohibited_actions: ['Do not leave a restricted package.'],
          documentation: ['Scan the completed door tag.'],
          escalation_requirements: ['Contact management if the service type is unclear.']
        },
        trace: [{ knowledge_id: 'KNO-SIG', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Signature help');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('Confirm the signature type.')).toBeTruthy();
    expect(screen.getByText('Complete the applicable attempt procedure.')).toBeTruthy();
    expect(screen.getByText('Use the verified signature procedure.')).toBeTruthy();
    expect(screen.getByText('Watch for')).toBeTruthy();
    expect(screen.getByText('Do not leave a restricted package.')).toBeTruthy();
    expect(screen.queryByText('A long fallback answer.')).toBeNull();

    fireEvent.press(screen.getByText('More Info'));
    expect(screen.getByText('Scan the completed door tag.')).toBeTruthy();
    expect(screen.getByText('Contact management if the service type is unclear.')).toBeTruthy();
  });

  it('renders signed visual references and opens them full screen', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-image',
        interaction_id: 'interaction-image',
        response_mode: 'ANSWER',
        answer: 'Enable Camera Scan in FORGE settings.',
        images: [{
          filename: 'FAQ-FORGE-SETTINGS-P005.png',
          caption: 'Use Camera to Scan setting',
          width: 1170,
          height: 2532,
          url: 'https://signed.test/driver-help-images/settings.png'
        }],
        trace: [{ knowledge_id: 'KNO-FORGE-CAMERA-SCAN-001', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'How do I use camera scan?');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('Visual reference')).toBeTruthy();
    expect(screen.getByText('Use Camera to Scan setting')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Open image: Use Camera to Scan setting'));
    expect(screen.getByLabelText('Close image')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close image'));
    expect(screen.queryByLabelText('Close image')).toBeNull();
  });

  it('shows approved alternatives as expandable choices', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-isr',
        interaction_id: 'interaction-isr',
        response_mode: 'ANSWER',
        answer: 'Fallback ISR answer.',
        answer_structure: {
          steps: ['Yes—if FORGE shows ISR and no stricter service applies.'],
          options: [
            {
              id: 'isr-neighbor',
              label: 'A neighbor accepts and signs',
              summary: 'Allowed for eligible ISR packages when the neighbor accepts and signs.',
              details: ['Record the neighbor address.', 'Leave the completed door tag at the original address.']
            },
            {
              id: 'isr-address-signature',
              label: 'Someone at the address signs',
              summary: 'Get an in-person signature at the labeled address.',
              details: ['Complete the FORGE prompts.']
            }
          ]
        },
        trace: [{ knowledge_id: 'KNO-DEL-SIG-ISR-001', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Can a neighbor sign?');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('Yes—if FORGE shows ISR and no stricter service applies.')).toBeTruthy();
    expect(screen.getByText('A neighbor accepts and signs')).toBeTruthy();
    expect(screen.getByText('Someone at the address signs')).toBeTruthy();
    expect(screen.queryByText('Record the neighbor address.')).toBeNull();

    fireEvent.press(screen.getByLabelText('A neighbor accepts and signs. Show details'));
    expect(screen.getByText('Record the neighbor address.')).toBeTruthy();
    expect(screen.getByText('Leave the completed door tag at the original address.')).toBeTruthy();
  });

  it('shows status-code paths and reveals the exact code with one tap', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-alcohol-codes',
        interaction_id: 'interaction-alcohol-codes',
        response_mode: 'ANSWER',
        answer: 'Alcohol requires an eligible adult signer.',
        answer_structure: {
          steps: ['Alcohol requires an eligible adult signer.'],
          options: [
            {
              id: 'alcohol-residential-007',
              label: 'Cannot deliver — residential',
              summary: 'Use Status Code 007 when the required delivery cannot be completed at a residential stop.',
              details: ['Use Status Code 007.', 'Complete and scan the door tag.']
            },
            {
              id: 'alcohol-id-refusal-006',
              label: 'Recipient refuses to provide ID',
              summary: 'Use Status Code 006 for the verified ID-refusal branch.',
              details: ['Use Status Code 006.', 'Add the required delivery notation.']
            }
          ]
        },
        trace: [{ knowledge_id: 'KNO-DEL-ALCOHOL-001', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Who can sign for this package with alcohol?');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText('Cannot deliver — residential')).toBeTruthy();
    expect(screen.getByText('Recipient refuses to provide ID')).toBeTruthy();
    expect(screen.queryByText('Use Status Code 007.')).toBeNull();

    fireEvent.press(screen.getByLabelText('Cannot deliver — residential. Show details'));
    expect(screen.getByText('Use Status Code 007.')).toBeTruthy();
    expect(screen.getByText('Complete and scan the door tag.')).toBeTruthy();
  });

  it('submits the retrieval query behind a driver-friendly clarification option', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-confirm',
          interaction_id: 'interaction-confirm',
          response_mode: 'CLARIFY',
          clarification_prompt: 'What do you mean by confirm the delivery?',
          clarification_options: [{
            knowledge_id: 'KNO-DEL-SCAN-INTEGRITY-001',
            version: 1,
            label: 'Make sure the delivery scan is accurate',
            query: 'Choosing when and where to scan a delivery or attempt'
          }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-confirm',
          interaction_id: 'interaction-scan',
          response_mode: 'ANSWER',
          answer: 'Scan at the customer location when the delivery actually happens.',
          trace: [{ knowledge_id: 'KNO-DEL-SCAN-INTEGRITY-001', version: 1 }]
        }
      });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'How do I confirm a package delivery?');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    await screen.findByText('What do you mean by confirm the delivery?');
    fireEvent.press(screen.getByText('Make sure the delivery scan is accurate'));

    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith('/driver-help/query', {
        question: 'Choosing when and where to scan a delivery or attempt',
        session_id: 'session-confirm'
      });
    });
  });

  it('submits a clarification option on the first tap and immediately shows progress', async () => {
    let resolveFollowUp;
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-one-tap',
          interaction_id: 'interaction-question',
          response_mode: 'CLARIFY',
          clarification_prompt: 'What signature type does FORGE show?',
          clarification_options: [{
            knowledge_id: 'FLOW:signature-type:dsr',
            version: 1,
            label: 'DSR — Direct Signature',
            query: 'DSR package nobody home'
          }]
        }
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFollowUp = resolve;
      }));
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'sig pkg nobody home');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    const option = await screen.findByLabelText('DSR — Direct Signature');
    fireEvent.press(option);
    fireEvent.press(option);

    expect(screen.getByText('Checking…')).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenLastCalledWith('/driver-help/query', {
      question: 'DSR package nobody home',
      session_id: 'session-one-tap'
    });

    await act(async () => resolveFollowUp({
      data: {
        session_id: 'session-one-tap',
        interaction_id: 'interaction-answer',
        response_mode: 'ANSWER',
        answer: 'Use the direct-signature procedure.',
        trace: [{ knowledge_id: 'KNO-DEL-SIG-DSR-001', version: 1 }]
      }
    }));
    expect(await screen.findByText('Use the direct-signature procedure.')).toBeTruthy();
  });

  it('lets a driver say they are not sure without inventing a clarification answer', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-unsure',
          interaction_id: 'interaction-unsure',
          response_mode: 'CLARIFY',
          clarification_prompt: 'What signature type does FORGE show?',
          clarification_options: []
        }
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-unsure',
          interaction_id: 'interaction-escalate',
          response_mode: 'ESCALATE',
          escalation_message: 'Contact your manager or station for the current procedure.'
        }
      });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Signature package nobody home');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    await screen.findByText('What signature type does FORGE show?');
    fireEvent.press(screen.getByLabelText('Not sure'));

    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith('/driver-help/query', {
        question: "I'm not sure.",
        session_id: 'session-unsure'
      });
      expect(screen.getByLabelText('Current question: Signature package nobody home')).toBeTruthy();
    });
  });

  it('renders escalation instead of an unsupported operational answer', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-2',
        interaction_id: 'interaction-2',
        response_mode: 'ESCALATE',
        escalation_message: 'Ready Route cannot establish an approved answer. Contact your manager.'
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Unknown strange package');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    await waitFor(() => {
      expect(screen.getByText('Answer unavailable')).toBeTruthy();
      expect(screen.getByText(
        'Ready Route does not have enough confirmed information to give a definitive answer for this situation.'
      )).toBeTruthy();
      expect(screen.getByText('Ready Route cannot establish an approved answer. Contact your manager.')).toBeTruthy();
      expect(screen.getByText('Ready Route will not guess.')).toBeTruthy();
    });
  });

  it('states clearly that a network timeout produced no confirmed answer', async () => {
    api.post.mockRejectedValueOnce(Object.assign(new Error('timeout of 15000ms exceeded'), {
      code: 'ECONNABORTED'
    }));
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Signature package nobody home');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(await screen.findByText(
      'Ready Route did not receive a confirmed answer. Check your connection and tap Ask Ready Route again. Contact your manager if you need an immediate answer.'
    )).toBeTruthy();
    expect(screen.queryByText('What to do now')).toBeNull();
  });

  it('prevents duplicate submissions while a verification request is pending', async () => {
    let resolveRequest;
    api.post.mockReturnValueOnce(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Pickup barcode will not scan');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => resolveRequest({
      data: {
        session_id: 'session-pending',
        interaction_id: 'interaction-pending',
        response_mode: 'ANSWER',
        answer: 'Use the verified scanner procedure.',
        trace: [{ knowledge_id: 'KNO-PUP-SCANNER-FAIL-001', version: 1 }]
      }
    }));
    expect(await screen.findByText('Use the verified scanner procedure.')).toBeTruthy();
  });

  it('starts a new situation without carrying over the previous session', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-old',
          interaction_id: 'interaction-old',
          response_mode: 'ANSWER',
          answer: 'Complete the approved procedure.',
          trace: [{ knowledge_id: 'KNO-OLD', version: 1 }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-new',
          interaction_id: 'interaction-new',
          response_mode: 'ANSWER',
          answer: 'Use the procedure for the new situation.',
          trace: [{ knowledge_id: 'KNO-NEW', version: 1 }]
        }
      });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'First driver situation');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    await screen.findByText('Complete the approved procedure.');

    fireEvent.press(screen.getByLabelText('Start a new question'));
    expect(screen.queryByText('Complete the approved procedure.')).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Different driver situation');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));

    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith('/driver-help/query', {
        question: 'Different driver situation'
      });
      expect(screen.getByText('Use the procedure for the new situation.')).toBeTruthy();
    });
  });

  it('returns from an answer to the previous ask screen', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-back',
        interaction_id: 'interaction-back',
        response_mode: 'ANSWER',
        answer: 'Complete the verified procedure.',
        trace: [{ knowledge_id: 'KNO-BACK', version: 1 }]
      }
    });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'A driver question');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    await screen.findByText('Complete the verified procedure.');

    expect(screen.getByLabelText('Swipe back')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Go back'));

    expect(screen.getByText('What do you need help with?')).toBeTruthy();
    expect(screen.queryByText('Complete the verified procedure.')).toBeNull();
  });

  it('returns from a clarification answer to the prior clarification step', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-history',
          interaction_id: 'interaction-question',
          response_mode: 'CLARIFY',
          clarification_prompt: 'What signature type does FORGE show?',
          clarification_options: [{ label: 'ISR — Indirect Signature', query: 'ISR package' }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-history',
          interaction_id: 'interaction-answer',
          response_mode: 'ANSWER',
          answer: 'Use the verified ISR procedure.',
          trace: [{ knowledge_id: 'KNO-ISR', version: 1 }]
        }
      });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'Signature package nobody home');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    await screen.findByText('What signature type does FORGE show?');
    fireEvent.press(screen.getByText('ISR — Indirect Signature'));
    await screen.findByText('Use the verified ISR procedure.');

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(screen.getByText('What signature type does FORGE show?')).toBeTruthy();
    expect(screen.queryByText('Use the verified ISR procedure.')).toBeNull();
  });

  it('recognizes only deliberate right swipes that begin at the left edge', () => {
    expect(shouldStartBackSwipe({ startX: 20, dx: 30, dy: 4, hasResult: true, isSubmitting: false })).toBe(true);
    expect(shouldStartBackSwipe({ startX: 80, dx: 100, dy: 4, hasResult: true, isSubmitting: false })).toBe(false);
    expect(shouldStartBackSwipe({ startX: 20, dx: 30, dy: 40, hasResult: true, isSubmitting: false })).toBe(false);
    expect(shouldCompleteBackSwipe({ dx: 120, vx: 0.1 })).toBe(true);
    expect(shouldCompleteBackSwipe({ dx: 75, vx: 0.3 })).toBe(true);
    expect(shouldCompleteBackSwipe({ dx: 60, vx: 0.5 })).toBe(false);
  });

  it('resets a retained answer scroll position before showing a new screen', () => {
    const scrollTo = jest.fn();
    const scheduleImmediately = (callback) => {
      callback();
      return 1;
    };

    resetDriverHelpViewport({ current: { scrollTo } }, scheduleImmediately);

    expect(scrollTo).toHaveBeenCalledWith({ animated: false, y: 0 });
  });

  it('sends answer feedback against the interaction', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          session_id: 'session-1',
          interaction_id: 'interaction-1',
          response_mode: 'ANSWER',
          answer: 'Approved answer.',
          trace: [{ knowledge_id: 'KNO-1', version: 1 }]
        }
      })
      .mockResolvedValueOnce({ data: { feedback: { rating: 'up' } } });
    const screen = render(<DriverHelpScreen />);

    fireEvent.changeText(screen.getByLabelText('Driver question'), 'A valid driver question');
    fireEvent.press(screen.getByLabelText('Ask Ready Route'));
    await screen.findByText('Approved answer.');
    fireEvent.press(screen.getByLabelText('Helpful answer'));

    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith(
        '/driver-help/interactions/interaction-1/feedback',
        { rating: 'up' }
      );
    });
  });
});
