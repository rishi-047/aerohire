import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import { assessmentApi, telemetryApi, authApi, type CodeSubmitResponse, type CodeHistoryEntry, type CharBreakdown } from '../lib/api';

/**
 * Mock question types
 */
interface CodingQuestion {
  id: number;
  title: string;
  type: 'coding';
  description: string;
  difficulty: string;
  testCases: Array<{ input: unknown; expected: unknown; unpack?: boolean }>;
  starterCode: string;
}

interface PsychometricQuestion {
  id: number;
  title: string;
  type: 'psychometric';
  description: string;
  scenario: string;
  options: Array<{ label: string; value: string }>;
}

interface TextQuestion {
  id: number;
  title: string;
  type: 'text';
  description: string;
  prompt: string;
  minLength: number;
}

interface LogicQuestion {
  id: number;
  title: string;
  type: 'logic';
  description: string;
  puzzle: string;
  options: Array<{ label: string; value: string }>;
  correctAnswer: string;
}

type Question = CodingQuestion | PsychometricQuestion | TextQuestion | LogicQuestion;

/**
 * Mock questions for demo - includes Q4 Text-based Response
 */
const MOCK_QUESTIONS: Record<number, Question> = {
  1: {
    id: 1,
    title: 'Reverse a String',
    type: 'coding',
    difficulty: 'Easy',
    description: `Write a function \`solution(s)\` that takes a string \`s\` and returns the string reversed.

**Example:**
- Input: \`"hello"\`
- Output: \`"olleh"\`

**Constraints:**
- The string will only contain lowercase letters
- Length of string: 1 <= len(s) <= 1000`,
    testCases: [
      { input: 'hello', expected: 'olleh' },
      { input: 'world', expected: 'dlrow' },
      { input: 'python', expected: 'nohtyp' },
      { input: 'a', expected: 'a' },
      { input: 'racecar', expected: 'racecar' },
    ],
    starterCode: `def solution(s):
    # Write your code here
    pass
`,
  },
  2: {
    id: 2,
    title: 'Detect Cycle in Linked List',
    type: 'coding',
    difficulty: 'Hard',
    description: `Given head, the head of a linked list, determine if the linked list has a cycle in it.

For this platform, the input is provided as:
- \`values\`: an array of node values
- \`pos\`: the index where the tail connects (-1 means no cycle)

Return \`True\` if a cycle exists, otherwise \`False\`.

**Constraints:**
- O(N) Time
- O(1) Memory`,
    testCases: [
      { input: [[3, 2, 0, -4], 1], expected: true, unpack: true },
      { input: [[1, 2], 0], expected: true, unpack: true },
      { input: [[1], -1], expected: false, unpack: true },
      // Hidden cases
      { input: [[1, 2, 3, 4, 5], -1], expected: false, unpack: true },
      { input: [[10, 20, 30, 40], 2], expected: true, unpack: true },
      { input: [[], -1], expected: false, unpack: true },
    ],
    starterCode: `def solution(values, pos):
    # Build a linked list from values and use pos to create a cycle.
    # Return True if a cycle exists, otherwise False.
    pass
`,
  },
  3: {
    id: 3,
    title: 'Deadline Scenario',
    type: 'psychometric',
    description: 'This question assesses your problem-solving approach under pressure.',
    scenario: `You are working on a critical project with a deadline in 2 days. You've just discovered a major bug that will take at least 3 days to fix properly. Your manager is expecting the delivery on time.

What would be your approach to handle this situation?`,
    options: [
      {
        label: 'A',
        value: 'Work overtime and weekends to try to meet the original deadline, even if it means cutting corners on testing.',
      },
      {
        label: 'B',
        value: 'Immediately inform your manager about the situation and propose a revised timeline with proper fix.',
      },
      {
        label: 'C',
        value: 'Implement a quick workaround to meet the deadline, and plan to fix it properly in the next sprint.',
      },
      {
        label: 'D',
        value: 'Delegate the bug fix to a colleague while you focus on other deliverables.',
      },
    ],
  },
  4: {
    id: 4,
    title: 'Workplace Culture',
    type: 'text',
    description: 'This question assesses your collaboration and communication skills.',
    prompt: `Describe a time you worked with a diverse team. How did you ensure everyone's voice was heard?

Consider including:
- The context of the team/project
- Specific actions you took
- The outcome of your approach`,
    minLength: 50,
  },
  5: {
    id: 5,
    title: 'Logic Puzzle',
    type: 'logic',
    description: 'This question assesses your analytical thinking and problem-solving skills.',
    puzzle: `You have three boxes. One contains only apples, one contains only oranges, and one contains both apples and oranges. The boxes are labeled, but ALL labels are wrong.

You can pick one fruit from one box without looking inside. Which box should you pick from to determine the contents of all three boxes?`,
    options: [
      {
        label: 'A',
        value: 'Pick from the box labeled "Apples"',
      },
      {
        label: 'B',
        value: 'Pick from the box labeled "Oranges"',
      },
      {
        label: 'C',
        value: 'Pick from the box labeled "Apples and Oranges"',
      },
      {
        label: 'D',
        value: 'It is impossible to determine with just one pick',
      },
    ],
    correctAnswer: 'Pick from the box labeled "Apples and Oranges"',
  },
};

/**
 * Format seconds to MM:SS
 */
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Assessment Interface - F1 Cockpit Themed IDE
 */
export default function Assessment() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // User/Candidate state
  const [candidateId, setCandidateId] = useState<number | null>(null);

  // Camera integrity state
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'active' | 'error'>('idle');
  const [integrityMode, setIntegrityMode] = useState<'none' | 'face' | 'motion'>('none');
  const [integrityDebug, setIntegrityDebug] = useState({
    faceCount: 0,
    motionDelta: 0,
    noFaceStreak: 0,
    multiFaceStreak: 0,
    motionStreak: 0,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceDetectorRef = useRef<any>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const noFaceStreakRef = useRef(0);
  const multiFaceStreakRef = useRef(0);
  const motionStreakRef = useRef(0);
  const lastFaceMetricsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const lastFrameDataRef = useRef<ImageData | null>(null);
  const lastTelemetryRef = useRef({
    noFace: 0,
    multiFace: 0,
    cameraOff: 0,
    paste: 0,
    motion: 0,
    tabSwitch: 0,
  });
  const tabSwitchTimesRef = useRef<number[]>([]);

  // Question state
  const [currentQuestionId, setCurrentQuestionId] = useState<number>(1);
  const currentQuestion = MOCK_QUESTIONS[currentQuestionId];

  // Editor state
  const [code, setCode] = useState<string>(
    (MOCK_QUESTIONS[1] as CodingQuestion).starterCode
  );

  // MCQ state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [mcqSubmitted, setMcqSubmitted] = useState<boolean>(false);

  // Text response state (Q4)
  const [textResponse, setTextResponse] = useState<string>('');
  const [textSubmitted, setTextSubmitted] = useState<boolean>(false);

  // Timer state (45 minutes = 2700 seconds)
  const [timeRemaining, setTimeRemaining] = useState<number>(45 * 60);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<CodeSubmitResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, { code?: string; testResults?: CodeSubmitResponse }>>({});
  const [completedQuestions, setCompletedQuestions] = useState<Record<number, boolean>>({});

  // Proctoring state
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);

  // End test modal
  const [showEndModal, setShowEndModal] = useState<boolean>(false);

  // Q5 Logic Puzzle state
  const [logicOption, setLogicOption] = useState<string | null>(null);
  const [logicSubmitted, setLogicSubmitted] = useState<boolean>(false);

  // ============================================
  // Innovation Trinity: Simulated Teammate Chatbot
  // ============================================
  const [showChatbot, setShowChatbot] = useState<boolean>(false);
  const [chatResponse, setChatResponse] = useState<string>('');
  const [chatSubmitted, setChatSubmitted] = useState<boolean>(false);
  const chatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============================================
  // Innovation Trinity: Voice Input (Speech to Text)
  // ============================================
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ============================================
  // Innovation Trinity: Paste Forensics
  // ============================================
  const [charBreakdown, setCharBreakdown] = useState<CharBreakdown>({ typed: 0, pasted: 0 });

  // ============================================
  // Innovation Trinity: Code History (Playback)
  // ============================================
  const [codeHistory, setCodeHistory] = useState<CodeHistoryEntry[]>([]);
  const codeHistoryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editorRef = useRef<any>(null);
  const isPastingRef = useRef(false);
  const pasteDetectionUntilRef = useRef(0);

  const logTelemetryEvent = useCallback(async (
    eventType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
  ) => {
    if (!candidateId) return;
    try {
      await telemetryApi.log({
        candidate_id: candidateId,
        event_type: eventType,
        severity,
      });
    } catch (err) {
      console.error('Failed to log telemetry event:', err);
    }
  }, [candidateId]);

  const NO_FACE_THRESHOLD = 2;
  const MULTI_FACE_THRESHOLD = 1;
  const MOTION_THRESHOLD = 1;

  /**
   * Fetch user data on mount - use candidate_id from profile
   */
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await authApi.me();
        // Use the actual candidate_id from the user profile
        if (user.candidate_id) {
          setCandidateId(user.candidate_id);
        } else {
          console.error('No candidate profile found for user');
        }
      } catch (err) {
        console.error('Failed to fetch user:', err);
      }
    };
    fetchUser();
  }, [logTelemetryEvent]);

  /**
   * Set initial question from URL param
   */
  useEffect(() => {
    if (id && id !== 'start') {
      const questionId = parseInt(id, 10);
      if (MOCK_QUESTIONS[questionId]) {
        setCurrentQuestionId(questionId);
        if (MOCK_QUESTIONS[questionId].type === 'coding') {
          setCode((MOCK_QUESTIONS[questionId] as CodingQuestion).starterCode);
        }
      }
    }
  }, [id]);

  /**
   * Countdown timer
   */
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          // Auto-submit when time runs out
          handleEndTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /**
   * Proctoring: Camera-based face detection (Face/Multi-Face checks)
   */
  useEffect(() => {
    if (!candidateId) return;

    let cancelled = false;
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('error');
        setIntegrityMode('none');
        logTelemetryEvent('WEBCAM_DISABLED', 'HIGH');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;

        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          await videoEl.play();
        }

        setCameraStatus('active');

        const FaceDetectorCtor = (window as any).FaceDetector;
        if (!FaceDetectorCtor) {
          console.warn('FaceDetector API not available; falling back to motion detection.');
          setIntegrityMode('motion');

          detectionIntervalRef.current = setInterval(() => {
            if (!videoRef.current) return;

            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            const width = 64;
            const height = 48;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            ctx.drawImage(video, 0, 0, width, height);
            const frame = ctx.getImageData(0, 0, width, height);

            if (lastFrameDataRef.current) {
              const prev = lastFrameDataRef.current.data;
              const curr = frame.data;
              let diffSum = 0;
              let samples = 0;

              for (let i = 0; i < curr.length; i += 16) {
                const dr = Math.abs(curr[i] - prev[i]);
                const dg = Math.abs(curr[i + 1] - prev[i + 1]);
                const db = Math.abs(curr[i + 2] - prev[i + 2]);
                diffSum += (dr + dg + db) / 3;
                samples += 1;
              }

              const avgDiff = samples > 0 ? diffSum / samples : 0;
              if (avgDiff > 18) {
                motionStreakRef.current += 1;
              } else {
                motionStreakRef.current = 0;
              }

              const now = Date.now();
              if (
                motionStreakRef.current >= MOTION_THRESHOLD &&
                now - lastTelemetryRef.current.motion > 15000
              ) {
                lastTelemetryRef.current.motion = now;
                motionStreakRef.current = 0;
                logTelemetryEvent('SUSPICIOUS_BEHAVIOR', 'LOW');
              }
            }

            lastFrameDataRef.current = frame;
            setIntegrityDebug({
              faceCount: 0,
              motionDelta: Math.round(avgDiff),
              noFaceStreak: noFaceStreakRef.current,
              multiFaceStreak: multiFaceStreakRef.current,
              motionStreak: motionStreakRef.current,
            });
          }, 1500);

          return;
        }

        const detector = new FaceDetectorCtor({ maxDetectedFaces: 3, fastMode: true });
        setIntegrityMode('face');
        faceDetectorRef.current = detector;

        detectionIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || !faceDetectorRef.current) return;

          try {
            const detections = await faceDetectorRef.current.detect(videoRef.current);
            const count = Array.isArray(detections) ? detections.length : 0;
            setIntegrityDebug((prev) => ({
              ...prev,
              faceCount: count,
            }));

            if (count === 0) {
              noFaceStreakRef.current += 1;
              multiFaceStreakRef.current = 0;
              lastFaceMetricsRef.current = null;
            } else if (count > 1) {
              multiFaceStreakRef.current += 1;
              noFaceStreakRef.current = 0;
              lastFaceMetricsRef.current = null;
            } else {
              noFaceStreakRef.current = 0;
              multiFaceStreakRef.current = 0;

              const detection = detections[0];
              const box = detection?.boundingBox;
              if (box) {
                const centerX = box.x + box.width / 2;
                const centerY = box.y + box.height / 2;
                const metrics = { x: centerX, y: centerY, w: box.width, h: box.height };

                if (lastFaceMetricsRef.current) {
                  const prev = lastFaceMetricsRef.current;
                  const dxRatio = Math.abs(metrics.x - prev.x) / Math.max(prev.w, 1);
                  const dyRatio = Math.abs(metrics.y - prev.y) / Math.max(prev.h, 1);
                  const prevArea = Math.max(prev.w * prev.h, 1);
                  const currArea = metrics.w * metrics.h;
                  const scaleDelta = Math.abs(currArea - prevArea) / prevArea;

                  if (dxRatio > 0.35 || dyRatio > 0.35 || scaleDelta > 0.35) {
                    motionStreakRef.current += 1;
                  } else {
                    motionStreakRef.current = 0;
                  }

                  const now = Date.now();
                  if (
                    motionStreakRef.current >= MOTION_THRESHOLD &&
                    now - lastTelemetryRef.current.motion > 15000
                  ) {
                    lastTelemetryRef.current.motion = now;
                    motionStreakRef.current = 0;
                    logTelemetryEvent('SUSPICIOUS_BEHAVIOR', 'LOW');
                  }
                }

                lastFaceMetricsRef.current = metrics;
              }
            }

            const now = Date.now();
            if (
              noFaceStreakRef.current >= NO_FACE_THRESHOLD &&
              now - lastTelemetryRef.current.noFace > 15000
            ) {
              lastTelemetryRef.current.noFace = now;
              noFaceStreakRef.current = 0;
              logTelemetryEvent('FACE_NOT_DETECTED', 'MEDIUM');
            }

            if (
              multiFaceStreakRef.current >= MULTI_FACE_THRESHOLD &&
              now - lastTelemetryRef.current.multiFace > 15000
            ) {
              lastTelemetryRef.current.multiFace = now;
              multiFaceStreakRef.current = 0;
              logTelemetryEvent('MULTIPLE_FACES', 'HIGH');
            }

            setIntegrityDebug({
              faceCount: count,
              motionDelta: 0,
              noFaceStreak: noFaceStreakRef.current,
              multiFaceStreak: multiFaceStreakRef.current,
              motionStreak: motionStreakRef.current,
            });
          } catch (err) {
            console.error('Face detection error:', err);
          }
        }, 1200);

        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            setCameraStatus('error');
            const now = Date.now();
            if (now - lastTelemetryRef.current.cameraOff > 15000) {
              lastTelemetryRef.current.cameraOff = now;
              logTelemetryEvent('WEBCAM_DISABLED', 'HIGH');
            }
          };
        });
      } catch (err) {
        setCameraStatus('error');
        setIntegrityMode('none');
        logTelemetryEvent('WEBCAM_DISABLED', 'HIGH');
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      lastFrameDataRef.current = null;
      lastFaceMetricsRef.current = null;
      motionStreakRef.current = 0;
      setIntegrityDebug({
        faceCount: 0,
        motionDelta: 0,
        noFaceStreak: 0,
        multiFaceStreak: 0,
        motionStreak: 0,
      });
      setIntegrityMode('none');
      if (faceDetectorRef.current) {
        try {
          faceDetectorRef.current.close?.();
        } catch (err) {
          console.warn('Failed to close face detector:', err);
        }
        faceDetectorRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setCameraStatus('idle');
    };
  }, [candidateId, logTelemetryEvent]);

  /**
   * Proctoring: Tab switch detection
   */
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && candidateId) {
        const now = Date.now();
        const windowMs = 60000;
        tabSwitchTimesRef.current = tabSwitchTimesRef.current.filter(
          (timestamp) => now - timestamp < windowMs
        );
        tabSwitchTimesRef.current.push(now);
        const severity = tabSwitchTimesRef.current.length >= 3 ? 'HIGH' : 'MEDIUM';
        await logTelemetryEvent('TAB_SWITCH', severity);

        // Show warning
        setTabSwitchCount((prev) => prev + 1);
        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 5000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [candidateId, logTelemetryEvent]);

  /**
   * Innovation Trinity: Simulated Teammate Chatbot Timer
   * Shows the chatbot after 15 seconds on Q2 (Hard Coding) - Aggressive trigger
   */
  useEffect(() => {
    // Only trigger on Q2 (Hard coding question)
    if (currentQuestionId === 2 && !chatSubmitted) {
      chatTimerRef.current = setTimeout(() => {
        setShowChatbot(true);
      }, 15000); // 15 seconds - aggressive trigger to ensure culture test
    }

    return () => {
      if (chatTimerRef.current) {
        clearTimeout(chatTimerRef.current);
      }
    };
  }, [currentQuestionId, chatSubmitted]);

  /**
   * Innovation Trinity: Speech Recognition Setup
   */
  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        // Append to text response for Q4
        if (currentQuestionId === 4) {
          setTextResponse((prev) => prev + ' ' + transcript);
        }
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [currentQuestionId]);

  /**
   * Innovation Trinity: Code History Capture (every 5 seconds)
   */
  useEffect(() => {
    if (MOCK_QUESTIONS[currentQuestionId].type === 'coding') {
      // Start capturing code history every 5 seconds
      codeHistoryRef.current = setInterval(() => {
        setCodeHistory((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            code: code,
          },
        ]);
      }, 5000);
    }

    return () => {
      if (codeHistoryRef.current) {
        clearInterval(codeHistoryRef.current);
      }
    };
  }, [currentQuestionId, code]);

  /**
   * Handle code submission
   */
  const handleRunTests = useCallback(async () => {
    if (!candidateId || currentQuestion.type !== 'coding') return;

    // INTERCEPT: Force chatbot if not triggered yet on Q2
    // This ensures no one escapes the culture/collaboration test
    if (currentQuestionId === 2 && !chatSubmitted && !showChatbot) {
      // Clear the timer since we're triggering manually
      if (chatTimerRef.current) {
        clearTimeout(chatTimerRef.current);
      }
      setShowChatbot(true);
      return; // Don't run tests until they respond to the chat
    }

    setIsSubmitting(true);
    setTestResults(null);

    try {
      const codingQuestion = currentQuestion as CodingQuestion;

      // Capture final code snapshot before submitting
      const finalHistory: CodeHistoryEntry[] = [
        ...codeHistory,
        { timestamp: Date.now(), code },
      ];

      const response = await assessmentApi.submit({
        code,
        question_id: codingQuestion.id,
        candidate_id: candidateId,
        test_cases: codingQuestion.testCases.map((tc) => ({
          input: tc.input,
          expected: tc.expected,
          function: 'solution',
          unpack: tc.unpack,
        })),
        // Innovation Trinity data
        code_history: finalHistory,
        char_breakdown: charBreakdown,
        chat_response: chatSubmitted ? chatResponse : null,
      });
      setTestResults(response);
      setAnswers((prev) => ({
        ...prev,
        [currentQuestionId]: {
          ...prev[currentQuestionId],
          code,
          testResults: response,
        },
      }));
      if (response.is_passed) {
        setCompletedQuestions((prev) => ({
          ...prev,
          [currentQuestionId]: true,
        }));
      }
    } catch (err) {
      console.error('Submission failed:', err);
      const errorResult = {
        submission_id: 0,
        status: 'error',
        tests_passed: 0,
        tests_total: 0,
        execution_time_ms: 0,
        results: [],
        is_passed: false,
        mock_mode: false,
        error: 'Failed to submit code. Please try again.',
      };
      setTestResults(errorResult);
      setAnswers((prev) => ({
        ...prev,
        [currentQuestionId]: {
          ...prev[currentQuestionId],
          code,
          testResults: errorResult,
        },
      }));
    } finally {
      setIsSubmitting(false);
    }
  }, [code, candidateId, currentQuestion, codeHistory, charBreakdown, chatResponse, chatSubmitted, currentQuestionId, showChatbot]);

  /**
   * Handle MCQ selection
   */
  const handleMCQSelect = useCallback((value: string) => {
    if (!mcqSubmitted) {
      setSelectedOption(value);
    }
  }, [mcqSubmitted]);

  /**
   * Handle MCQ submit
   */
  const handleMCQSubmit = useCallback(() => {
    if (selectedOption) {
      setMcqSubmitted(true);
      console.log('MCQ Answer submitted:', selectedOption);
    }
  }, [selectedOption]);

  /**
   * Handle Text response submit
   */
  const handleTextSubmit = useCallback(() => {
    if (textResponse.length >= 50) {
      setTextSubmitted(true);
      console.log('Text response submitted:', textResponse);
    }
  }, [textResponse]);

  /**
   * Handle Logic Puzzle selection (Q5)
   */
  const handleLogicSelect = useCallback((value: string) => {
    if (!logicSubmitted) {
      setLogicOption(value);
    }
  }, [logicSubmitted]);

  /**
   * Handle Logic Puzzle submit (Q5)
   */
  const handleLogicSubmit = useCallback(() => {
    if (logicOption) {
      setLogicSubmitted(true);
      console.log('Logic answer submitted:', logicOption);
    }
  }, [logicOption]);

  /**
   * Innovation Trinity: Toggle Speech Recognition
   */
  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  /**
   * Innovation Trinity: Submit Chat Response
   */
  const handleChatSubmit = useCallback(async () => {
    if (chatResponse.trim().length > 0) {
      try {
        if (candidateId) {
          await assessmentApi.submitChatResponse(candidateId, currentQuestionId, chatResponse.trim());
        }
      } catch (err) {
        console.error('Failed to save chat response:', err);
      } finally {
        setChatSubmitted(true);
        setShowChatbot(false);
        console.log('Chat response submitted:', chatResponse);
      }
    }
  }, [chatResponse, candidateId, currentQuestionId]);

  /**
   * Innovation Trinity: Handle Monaco Editor Mount (for forensics tracking)
   */
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    const markPasteSignal = () => {
      isPastingRef.current = true;
      // Keep a brief window so all model changes from one paste are counted.
      pasteDetectionUntilRef.current = Date.now() + 800;
    };

    // Track paste events
    editor.onDidPaste(() => {
      markPasteSignal();
    });

    // Keyboard fallback for environments where onDidPaste is inconsistent
    editor.onKeyDown((e) => {
      const browserEvent = (e as any).browserEvent as KeyboardEvent | undefined;
      const isPasteShortcut =
        (e.metaKey || e.ctrlKey) &&
        ((browserEvent?.key && browserEvent.key.toLowerCase() === 'v') || false);
      if (isPasteShortcut) {
        markPasteSignal();
      }
    });

    // Track typed characters
    editor.onDidChangeModelContent((e) => {
      let pastedChars = 0;
      let typedChars = 0;
      if (Date.now() > pasteDetectionUntilRef.current) {
        isPastingRef.current = false;
      }
      const isPasteWindowActive = Date.now() <= pasteDetectionUntilRef.current;
      const isPasteChange = isPastingRef.current || isPasteWindowActive;

      for (const change of e.changes) {
        if (!change.text) continue;
        const length = change.text.length;

        // Count as pasted only when Monaco explicitly reports a paste event.
        // This avoids false positives from normal typing operations that insert
        // multiple chars (auto-indent, bracket pairs, snippet expansion, etc).
        if (isPasteChange) {
          pastedChars += length;
        } else {
          typedChars += length;
        }
      }

      if (pastedChars > 0) {
        setCharBreakdown((prev) => ({
          ...prev,
          pasted: prev.pasted + pastedChars,
        }));

        const now = Date.now();
        if (now - lastTelemetryRef.current.paste > 15000) {
          lastTelemetryRef.current.paste = now;
          logTelemetryEvent('COPY_PASTE_DETECTED', 'HIGH');
        }
      }

      if (typedChars > 0) {
        setCharBreakdown((prev) => ({
          ...prev,
          typed: prev.typed + typedChars,
        }));
      }

      if (!isPasteWindowActive) {
        isPastingRef.current = false;
      }
    });
  }, []);

  /**
   * Switch between questions
   */
  const handleQuestionSwitch = useCallback((questionId: number) => {
    // Auto-save current coding answer before switching
    if (MOCK_QUESTIONS[currentQuestionId].type === 'coding') {
      setAnswers((prev) => ({
        ...prev,
        [currentQuestionId]: {
          ...prev[currentQuestionId],
          code,
        },
      }));
    }

    const savedAnswer = answers[questionId];

    setCurrentQuestionId(questionId);
    if (MOCK_QUESTIONS[questionId].type === 'coding') {
      setCode(savedAnswer?.code ?? (MOCK_QUESTIONS[questionId] as CodingQuestion).starterCode);
      setTestResults(savedAnswer?.testResults ?? null);
    } else {
      setTestResults(null);
    }
  }, [answers, code, currentQuestionId]);

  /**
   * Calculate behavioral score based on answers
   */
  const calculateBehavioralScore = useCallback((): number => {
    let score = 0;

    // Q3 (MCQ): If Option B is selected -> +50 points
    // Option B: "Immediately inform your manager about the situation and propose a revised timeline with proper fix."
    if (mcqSubmitted && selectedOption?.includes('Immediately inform your manager')) {
      score += 50;
    }

    // Q4 (Text): If text length > 50 chars -> +50 points
    if (textSubmitted && textResponse.length > 50) {
      score += 50;
    }

    return score;
  }, [mcqSubmitted, selectedOption, textSubmitted, textResponse]);

  /**
   * End test - complete assessment and generate AI recommendation
   */
  const handleEndTest = useCallback(async () => {
    setShowEndModal(false);

    if (!candidateId) {
      console.error('No candidate ID available');
      navigate('/candidate/dashboard');
      return;
    }

    try {
      // Calculate behavioral score before completing
      const behavioralScore = calculateBehavioralScore();
      console.log('Calculated behavioral score:', behavioralScore);

      // Call the complete endpoint with behavioral score
      const result = await assessmentApi.complete(candidateId, behavioralScore);

      console.log('Assessment completed:', result);
      console.log('AI Recommendation:', result.hiring_recommendation);
      console.log('Confidence:', result.confidence_score);
      console.log('Behavioral Score:', result.psychometric_score);

      // Navigate to dashboard after completion
      navigate('/candidate/dashboard');
    } catch (err) {
      console.error('Failed to complete assessment:', err);
      // Still navigate even on error - the recruiter can review manually
      navigate('/candidate/dashboard');
    }
  }, [candidateId, navigate, calculateBehavioralScore]);

  // Timer color based on remaining time
  const timerColor =
    timeRemaining <= 300
      ? 'text-aero-red'
      : timeRemaining <= 600
      ? 'text-aero-orange'
      : 'text-aero-cyan';

  const recordingActive = cameraStatus === 'active';
  const recordingLabel =
    cameraStatus === 'active' ? 'Recording' : cameraStatus === 'error' ? 'Camera Off' : 'Starting';
  const recordingClass =
    cameraStatus === 'active'
      ? 'bg-aero-red/20 border-aero-red/30 text-aero-red'
      : 'bg-aero-orange/20 border-aero-orange/30 text-aero-orange';

  // Get question status indicators
  const getQuestionStatus = (qId: number) => {
    const storedResults = qId === currentQuestionId ? testResults : answers[qId]?.testResults;
    if ((qId === 1 || qId === 2) && (completedQuestions[qId] || storedResults?.is_passed)) return 'completed';
    if (qId === 3 && mcqSubmitted) return 'completed';
    if (qId === 4 && textSubmitted) return 'completed';
    if (qId === 5 && logicSubmitted) return 'completed';
    return 'pending';
  };

  return (
    <div className="h-screen flex flex-col bg-aero-bg overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 bg-aero-surface border-b border-aero-border flex items-center justify-between px-4 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-aero-cyan tracking-wider">
            AEROHIRE
          </h1>
          <span className="text-aero-muted text-sm">Assessment</span>
        </div>

        {/* Center: Timer */}
        <div className="flex items-center gap-4">
          <div className={`font-mono text-2xl font-semibold ${timerColor}`}>
            {formatTime(timeRemaining)}
          </div>
        </div>

        {/* Right: Recording Badge + End Test */}
        <div className="flex items-center gap-4">
          {/* Recording Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${recordingClass}`}>
            <span
              className={`w-2 h-2 rounded-full ${recordingActive ? 'bg-aero-red animate-pulse' : 'bg-aero-orange'}`}
            />
            <span className="text-sm font-medium">{recordingLabel}</span>
          </div>

          {/* Tab Switch Counter */}
          {tabSwitchCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-aero-orange/20 border border-aero-orange/30">
              <span className="text-aero-orange text-sm">
                Tab switches: {tabSwitchCount}
              </span>
            </div>
          )}

          {/* End Test Button */}
          <button
            onClick={() => setShowEndModal(true)}
            className="px-4 py-2 bg-aero-red/20 text-aero-red border border-aero-red/30 rounded-lg hover:bg-aero-red/30 transition-colors text-sm font-medium"
          >
            End Test
          </button>
        </div>
      </header>

      {/* Hidden video element for camera-based integrity checks */}
      <video ref={videoRef} className="hidden" muted playsInline aria-hidden="true" />

      {/* Main Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel - Question */}
        <div className="w-1/2 bg-aero-surface border-r border-aero-border flex flex-col">
          {/* Question Header */}
          <div className="p-4 border-b border-aero-border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">
                {currentQuestion.title}
              </h2>
              {currentQuestion.type === 'coding' && (
                <span className="px-2 py-1 text-xs rounded bg-aero-green/20 text-aero-green">
                  {(currentQuestion as CodingQuestion).difficulty}
                </span>
              )}
              {currentQuestion.type === 'psychometric' && (
                <span className="px-2 py-1 text-xs rounded bg-aero-purple/20 text-aero-purple">
                  Behavioral
                </span>
              )}
              {currentQuestion.type === 'text' && (
                <span className="px-2 py-1 text-xs rounded bg-aero-indigo/20 text-aero-indigo">
                  Written Response
                </span>
              )}
              {currentQuestion.type === 'logic' && (
                <span className="px-2 py-1 text-xs rounded bg-aero-orange/20 text-aero-orange">
                  Logic Puzzle
                </span>
              )}
            </div>

            {/* Question Switcher */}
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5].map((qId) => {
                const status = getQuestionStatus(qId);
                const isActive = currentQuestionId === qId;
                const labels = ['Q1: Coding', 'Q2: Coding (Hard)', 'Q3: Behavioral', 'Q4: Written', 'Q5: Logic'];

                return (
                  <button
                    key={qId}
                    onClick={() => handleQuestionSwitch(qId)}
                    className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-2 ${
                      isActive
                        ? 'bg-aero-cyan text-aero-bg'
                        : 'bg-aero-border text-aero-muted hover:bg-aero-border/80'
                    }`}
                  >
                    {status === 'completed' && (
                      <svg className="w-3 h-3 text-aero-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {labels[qId - 1]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Coding Question */}
            {currentQuestion.type === 'coding' && (
              <div className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-aero-text text-sm leading-relaxed font-sans">
                  {currentQuestion.description}
                </pre>
              </div>
            )}

            {/* Psychometric/MCQ Question */}
            {currentQuestion.type === 'psychometric' && (
              <div>
                <p className="text-aero-muted text-sm mb-4">
                  {currentQuestion.description}
                </p>
                <div className="bg-aero-bg/50 p-4 rounded-lg border border-aero-border mb-6">
                  <p className="text-white leading-relaxed">
                    {(currentQuestion as PsychometricQuestion).scenario}
                  </p>
                </div>

                {/* MCQ Options */}
                <div className="space-y-3">
                  {(currentQuestion as PsychometricQuestion).options.map((option) => (
                    <button
                      key={option.label}
                      onClick={() => handleMCQSelect(option.value)}
                      disabled={mcqSubmitted}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        selectedOption === option.value
                          ? mcqSubmitted
                            ? 'border-aero-green bg-aero-green/10'
                            : 'border-aero-cyan bg-aero-cyan/10'
                          : mcqSubmitted
                          ? 'border-aero-border/50 opacity-50'
                          : 'border-aero-border hover:border-aero-cyan/50'
                      }`}
                    >
                      <span
                        className={`font-semibold mr-2 ${
                          selectedOption === option.value
                            ? mcqSubmitted ? 'text-aero-green' : 'text-aero-cyan'
                            : 'text-aero-muted'
                        }`}
                      >
                        {option.label})
                      </span>
                      <span className="text-aero-text text-sm">{option.value}</span>
                    </button>
                  ))}
                </div>

                {!mcqSubmitted && selectedOption && (
                  <button
                    onClick={handleMCQSubmit}
                    className="mt-6 px-6 py-3 bg-aero-cyan text-aero-bg font-semibold rounded-lg hover:bg-aero-cyan/90 transition-colors"
                  >
                    Submit Answer
                  </button>
                )}

                {mcqSubmitted && (
                  <div className="mt-6 p-4 bg-aero-green/10 border border-aero-green/30 rounded-lg">
                    <div className="flex items-center gap-2 text-aero-green">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-medium">Answer submitted successfully!</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Text Response Question (Q4) */}
            {currentQuestion.type === 'text' && (
              <div>
                <p className="text-aero-muted text-sm mb-4">
                  {currentQuestion.description}
                </p>
                <div className="bg-aero-bg/50 p-4 rounded-lg border border-aero-border mb-6">
                  <p className="text-white leading-relaxed whitespace-pre-wrap">
                    {(currentQuestion as TextQuestion).prompt}
                  </p>
                </div>

                {/* Text Area with Voice Input */}
                <div className="space-y-4">
                  <div className="relative">
                    <textarea
                      value={textResponse}
                      onChange={(e) => !textSubmitted && setTextResponse(e.target.value)}
                      disabled={textSubmitted}
                      placeholder="Write your response here... or use voice input"
                      className={`w-full h-64 p-4 pr-14 bg-aero-bg border rounded-lg text-aero-text resize-none focus:outline-none focus:ring-2 transition-all ${
                        textSubmitted
                          ? 'border-aero-green/30 bg-aero-green/5'
                          : 'border-aero-border focus:ring-aero-cyan/50 focus:border-aero-cyan'
                      }`}
                    />
                    {/* Voice Input Button */}
                    {speechSupported && !textSubmitted && (
                      <button
                        onClick={toggleListening}
                        className={`absolute top-3 right-3 w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                          isListening
                            ? 'bg-aero-red text-white animate-pulse'
                            : 'bg-aero-surface border border-aero-border text-aero-muted hover:text-aero-cyan hover:border-aero-cyan'
                        }`}
                        title={isListening ? 'Stop listening' : 'Start voice input'}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          {isListening ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          )}
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Character count */}
                  <div className="flex items-center justify-between text-sm">
                    <span className={`${textResponse.length >= 50 ? 'text-aero-green' : 'text-aero-muted'}`}>
                      {textResponse.length} characters
                      {textResponse.length < 50 && ` (minimum 50 required)`}
                    </span>
                    {textResponse.length >= 50 && !textSubmitted && (
                      <span className="text-aero-green flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Ready to submit
                      </span>
                    )}
                  </div>

                  {!textSubmitted && (
                    <button
                      onClick={handleTextSubmit}
                      disabled={textResponse.length < 50}
                      className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
                        textResponse.length >= 50
                          ? 'bg-aero-cyan text-aero-bg hover:bg-aero-cyan/90'
                          : 'bg-aero-border text-aero-muted cursor-not-allowed'
                      }`}
                    >
                      Submit Response
                    </button>
                  )}

                  {textSubmitted && (
                    <div className="p-4 bg-aero-green/10 border border-aero-green/30 rounded-lg">
                      <div className="flex items-center gap-2 text-aero-green">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-medium">Response submitted successfully!</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Logic Puzzle Question (Q5) */}
            {currentQuestion.type === 'logic' && (
              <div>
                <p className="text-aero-muted text-sm mb-4">
                  {currentQuestion.description}
                </p>
                <div className="bg-aero-bg/50 p-4 rounded-lg border border-aero-border mb-6">
                  <p className="text-white leading-relaxed whitespace-pre-wrap">
                    {(currentQuestion as LogicQuestion).puzzle}
                  </p>
                </div>

                {/* Logic Options */}
                <div className="space-y-3">
                  {(currentQuestion as LogicQuestion).options.map((option) => (
                    <button
                      key={option.label}
                      onClick={() => handleLogicSelect(option.value)}
                      disabled={logicSubmitted}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        logicOption === option.value
                          ? logicSubmitted
                            ? option.value === (currentQuestion as LogicQuestion).correctAnswer
                              ? 'border-aero-green bg-aero-green/10'
                              : 'border-aero-red bg-aero-red/10'
                            : 'border-aero-cyan bg-aero-cyan/10'
                          : logicSubmitted
                          ? 'border-aero-border/50 opacity-50'
                          : 'border-aero-border hover:border-aero-cyan/50'
                      }`}
                    >
                      <span
                        className={`font-semibold mr-2 ${
                          logicOption === option.value
                            ? logicSubmitted
                              ? option.value === (currentQuestion as LogicQuestion).correctAnswer
                                ? 'text-aero-green'
                                : 'text-aero-red'
                              : 'text-aero-cyan'
                            : 'text-aero-muted'
                        }`}
                      >
                        {option.label})
                      </span>
                      <span className="text-aero-text text-sm">{option.value}</span>
                    </button>
                  ))}
                </div>

                {!logicSubmitted && logicOption && (
                  <button
                    onClick={handleLogicSubmit}
                    className="mt-6 px-6 py-3 bg-aero-cyan text-aero-bg font-semibold rounded-lg hover:bg-aero-cyan/90 transition-colors"
                  >
                    Submit Answer
                  </button>
                )}

                {logicSubmitted && (
                  <div className={`mt-6 p-4 rounded-lg border ${
                    logicOption === (currentQuestion as LogicQuestion).correctAnswer
                      ? 'bg-aero-green/10 border-aero-green/30'
                      : 'bg-aero-orange/10 border-aero-orange/30'
                  }`}>
                    <div className={`flex items-center gap-2 ${
                      logicOption === (currentQuestion as LogicQuestion).correctAnswer
                        ? 'text-aero-green'
                        : 'text-aero-orange'
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-medium">
                        {logicOption === (currentQuestion as LogicQuestion).correctAnswer
                          ? 'Correct! Great logical thinking.'
                          : 'Answer submitted. The correct answer involves picking from the mislabeled mixed box.'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Editor */}
        <div className="w-1/2 flex flex-col">
          {currentQuestion.type === 'coding' ? (
            <>
              {/* Editor Header */}
              <div className="h-10 bg-aero-surface border-b border-aero-border flex items-center px-4">
                <span className="text-sm text-aero-muted">solution.py</span>
                <span className="ml-auto text-xs text-aero-dim">Python 3.9</span>
              </div>

              {/* Monaco Editor */}
              <div className="flex-1">
                <Editor
                  height="100%"
                  language="python"
                  theme="vs-dark"
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 16, bottom: 16 },
                    lineNumbers: 'on',
                    renderLineHighlight: 'line',
                    automaticLayout: true,
                  }}
                />
              </div>

              {/* Output Console */}
              <div className="h-48 bg-aero-bg border-t border-aero-border flex flex-col">
                {/* Console Header */}
                <div className="h-10 bg-aero-surface border-b border-aero-border flex items-center justify-between px-4">
                  <span className="text-sm text-aero-muted">Test Results</span>
                  <button
                    onClick={handleRunTests}
                    disabled={isSubmitting}
                    className="px-4 py-1.5 bg-aero-cyan text-aero-bg text-sm font-semibold rounded hover:bg-aero-cyan/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Running...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Run Tests
                      </>
                    )}
                  </button>
                </div>

                {/* Console Output */}
                <div className="flex-1 p-4 overflow-y-auto font-mono text-sm">
                  {testResults ? (
                    <div>
                      {/* Summary */}
                      <div
                        className={`mb-3 p-3 rounded-lg ${
                          testResults.is_passed
                            ? 'bg-aero-green/10 border border-aero-green/30'
                            : testResults.error
                            ? 'bg-aero-red/10 border border-aero-red/30'
                            : 'bg-aero-orange/10 border border-aero-orange/30'
                        }`}
                      >
                        <span
                          className={
                            testResults.is_passed
                              ? 'text-aero-green'
                              : testResults.error
                              ? 'text-aero-red'
                              : 'text-aero-orange'
                          }
                        >
                          {testResults.is_passed
                            ? 'All tests passed!'
                            : testResults.error
                            ? `Error: ${testResults.error}`
                            : `Passed: ${testResults.tests_passed}/${testResults.tests_total}`}
                        </span>
                        {testResults.execution_time_ms > 0 && (
                          <span className="text-aero-dim ml-2">
                            ({testResults.execution_time_ms}ms)
                          </span>
                        )}
                      </div>

                      {/* Individual Results */}
                      {testResults.results.map((result, idx) => (
                        <div
                          key={idx}
                          className={`mb-2 p-2 rounded ${
                            result.status === 'passed'
                              ? 'text-aero-green'
                              : 'text-aero-red'
                          }`}
                        >
                          <span>
                            Test {result.test}:{' '}
                            {result.status === 'passed' ? 'PASS' : 'FAIL'}
                          </span>
                          {result.status !== 'passed' && result.message && (
                            <div className="text-xs text-aero-muted mt-1">
                              {result.message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-aero-dim">
                      Click "Run Tests" to execute your code against the test cases.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Placeholder for non-coding questions */
            <div className="flex-1 flex items-center justify-center bg-aero-bg">
              <div className="text-center max-w-md px-6">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-aero-surface border border-aero-border flex items-center justify-center">
                  {currentQuestion.type === 'psychometric' ? (
                    <svg className="w-10 h-10 text-aero-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : currentQuestion.type === 'logic' ? (
                    <svg className="w-10 h-10 text-aero-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10 text-aero-indigo" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-aero-text mb-2">
                  {currentQuestion.type === 'psychometric'
                    ? 'Behavioral Assessment'
                    : currentQuestion.type === 'logic'
                    ? 'Logic Puzzle'
                    : 'Written Response'}
                </h3>
                <p className="text-aero-muted text-sm">
                  {currentQuestion.type === 'psychometric'
                    ? 'Select the option that best describes your approach to the scenario.'
                    : currentQuestion.type === 'logic'
                    ? 'Choose the best answer to the puzzle on the left.'
                    : 'Provide a thoughtful written response to the prompt on the left.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Tab Switch Warning Toast */}
      {showWarning && (
        <div className="fixed top-20 right-4 z-50 animate-pulse">
          <div className="bg-aero-red/90 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="font-semibold">Focus Lost!</p>
              <p className="text-sm opacity-90">This event has been logged.</p>
            </div>
          </div>
        </div>
      )}

      {/* End Test Modal */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-aero-surface border border-aero-border rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              End Assessment?
            </h3>
            <p className="text-aero-muted text-sm mb-6">
              Are you sure you want to end the assessment? You won't be able to
              return to this test.
            </p>

            {/* Progress Summary */}
            <div className="mb-6 p-4 bg-aero-bg rounded-lg border border-aero-border">
              <p className="text-sm text-aero-muted mb-3">Your Progress:</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-aero-text">Q1: Coding</span>
                  <span className={completedQuestions[1] ? 'text-aero-green' : 'text-aero-orange'}>
                    {completedQuestions[1] ? 'Completed' : 'In Progress'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-aero-text">Q2: Coding (Hard)</span>
                  <span className={completedQuestions[2] ? 'text-aero-green' : 'text-aero-orange'}>
                    {completedQuestions[2] ? 'Completed' : 'In Progress'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-aero-text">Q3: Behavioral</span>
                  <span className={mcqSubmitted ? 'text-aero-green' : 'text-aero-orange'}>
                    {mcqSubmitted ? 'Completed' : 'In Progress'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-aero-text">Q4: Written</span>
                  <span className={textSubmitted ? 'text-aero-green' : 'text-aero-orange'}>
                    {textSubmitted ? 'Completed' : 'In Progress'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-aero-text">Q5: Logic</span>
                  <span className={logicSubmitted ? 'text-aero-green' : 'text-aero-orange'}>
                    {logicSubmitted ? 'Completed' : 'In Progress'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEndModal(false)}
                className="px-4 py-2 text-aero-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEndTest}
                className="px-4 py-2 bg-aero-red text-white rounded-lg hover:bg-aero-red-hover transition-colors"
              >
                End Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Innovation Trinity: Simulated Teammate Chatbot */}
      <AnimatePresence>
        {showChatbot && !chatSubmitted && (
          <motion.div
            initial={{ y: 400, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 400, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50 w-96"
          >
            <div className="bg-aero-surface border border-aero-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Chat Header */}
              <div className="bg-aero-indigo/20 border-b border-aero-border px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-aero-indigo/30 flex items-center justify-center">
                  <span className="text-aero-indigo font-bold">A</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-aero-text">Alex (Junior Dev)</p>
                  <p className="text-xs text-aero-green flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-aero-green animate-pulse" />
                    Online
                  </p>
                </div>
                <button
                  onClick={() => setShowChatbot(false)}
                  className="text-aero-muted hover:text-aero-text transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Chat Message */}
              <div className="p-4 bg-aero-bg/50">
                <div className="bg-aero-surface border border-aero-border/50 rounded-lg rounded-tl-none p-3 max-w-[85%]">
                  <p className="text-sm text-aero-text leading-relaxed">
                    Hey, sorry to interrupt. I see you're working on the linked list cycle problem. I'm stuck on the database migration. Any quick tips?
                  </p>
                  <p className="text-xs text-aero-dim mt-2">Just now</p>
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-aero-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatResponse}
                    onChange={(e) => setChatResponse(e.target.value)}
                    placeholder="Type a helpful response..."
                    className="flex-1 px-4 py-2 bg-aero-bg border border-aero-border rounded-lg text-aero-text text-sm focus:outline-none focus:ring-2 focus:ring-aero-indigo/50 focus:border-aero-indigo"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatResponse.trim()) {
                        handleChatSubmit();
                      }
                    }}
                  />
                  <button
                    onClick={handleChatSubmit}
                    disabled={!chatResponse.trim()}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      chatResponse.trim()
                        ? 'bg-aero-indigo text-white hover:bg-aero-indigo/90'
                        : 'bg-aero-border text-aero-muted cursor-not-allowed'
                    }`}
                  >
                    Send
                  </button>
                </div>
                <p className="text-xs text-aero-muted mt-2">
                  Your response will be evaluated for teamwork and collaboration.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Submitted Confirmation Toast */}
      <AnimatePresence>
        {chatSubmitted && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className="bg-aero-green/20 border border-aero-green/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <svg className="w-5 h-5 text-aero-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-aero-green text-sm font-medium">
                Thanks for helping Alex!
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
