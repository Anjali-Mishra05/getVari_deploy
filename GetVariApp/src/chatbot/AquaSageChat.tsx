import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  StatusBar,
  Image,
} from 'react-native';
import { MessageCircle, X, Send, Bot, Trash2 } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

interface AquaSageChatProps {
  userProfile?: any;
}

const INITIAL_GREETING = "Hi, I'm AquaSage AI! 💧 How can I help you today?";
const BOT_AVATAR_IMAGE = 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png'; // High quality assistant bot icon

const AquaSageChat: React.FC<AquaSageChatProps> = ({ userProfile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: INITIAL_GREETING,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [teaserText, setTeaserText] = useState('I can help you! 💧');
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  const teasers = [
    "I can help you! 💧",
    "Confused about hydration?",
    "Want to know some facts?",
    "Ask me about getVāri!",
    "Need hydration advice?",
  ];

  // 1. Cycle Teaser Text
  useEffect(() => {
    const interval = setInterval(() => {
      setTeaserText(prev => {
        const currentIndex = teasers.indexOf(prev);
        const nextIndex = (currentIndex + 1) % teasers.length;
        return teasers[nextIndex];
      });
    }, 60000); // 1 minute
    return () => clearInterval(interval);
  }, []);

  // 2. Aggressive Server Discovery Logic
  const discoverServer = async () => {
    const candidates = [
      'http://10.0.2.2:8000',      // Android Emulator
      'http://localhost:8000',     // iOS Simulator
      'http://192.168.0.101:8000', // Mac Local IP 1
      'http://192.168.1.101:8000', // Mac Local IP 2 (Common)
    ];

    for (const base of candidates) {
      try {
        console.log(`[AquaSage] Pinging ${base}...`);
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout
        const res = await fetch(`${base}/ping`, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) {
          console.log(`[AquaSage] Connected to: ${base}`);
          setServerUrl(base);
          return base;
        }
      } catch (e) {
        // Continue
      }
    }
    return null;
  };

  useEffect(() => {
    if (isOpen) discoverServer();
  }, [isOpen]);

  const toggleChat = () => {
    // Force a small delay to ensure the UI is ready
    if (!isOpen) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: INITIAL_GREETING,
        timestamp: new Date(),
      },
    ]);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const chatHistory = messages.slice(-5).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Ensure we have a URL, try discovery one last time if null
      let activeBase = serverUrl;
      if (!activeBase) {
        activeBase = await discoverServer();
      }

      const url = activeBase
        ? `${activeBase}/chat`
        : (Platform.OS === 'android' ? 'http://10.0.2.2:8000/chat' : 'http://localhost:8000/chat');

      console.log(`[AquaSage] Requesting: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.content,
          chatHistory,
          userProfile: userProfile || {}
        }),
      });

      if (!response.ok) throw new Error('AI Server responded with an error.');

      const data = await response.json();
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.answer || 'No response from AI.',
        timestamp: new Date(),
      }]);
    } catch (error: any) {
      console.error('Chat Error:', error);
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: Unable to reach AI server. \n\n1. Ensure "python Chatbot/backend/main.py" is running. \n2. Check your computer's IP address and verify it matches the app configuration.`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [messages, isLoading]);

  return (
    <>
      {/* Floating Action Button & Teaser Bubble */}
      <View className="absolute bottom-32 right-6 z-50 items-end">
        {!isOpen && (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={{
              marginBottom: 12,
              backgroundColor: '#011f4b', // Deep Navy Blue
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: '#ffffff',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 8,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: 'bold', fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo' }}>
              {teaserText}
            </Text>
            {/* Bubble arrow */}
            <View
              style={{
                position: 'absolute',
                bottom: -8,
                right: 20,
                width: 14,
                height: 14,
                backgroundColor: '#011f4b',
                borderRightWidth: 2,
                borderBottomWidth: 2,
                borderColor: '#ffffff',
                transform: [{ rotate: '45deg' }]
              }}
            />
          </Animated.View>
        )}

        <TouchableOpacity
          onPress={toggleChat}
          activeOpacity={0.9}
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: '#00f2fe',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#00f2fe',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
            elevation: 12,
          }}
        >
          {isOpen ? (
            <X color="#020617" size={28} strokeWidth={3} />
          ) : (
            <MessageCircle color="#020617" size={32} fill="#020617" fillOpacity={0.1} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={toggleChat}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'android' ? 25 : 0}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={toggleChat}
              style={{ flex: 1 }}
            />

            <Animated.View
              entering={SlideInDown.duration(350)}
              exiting={SlideOutDown.duration(250)}
              style={{
                height: '82%',
                maxHeight: '82%',
                backgroundColor: '#020617',
                borderTopLeftRadius: 40,
                borderTopRightRadius: 40,
                borderTopWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 24,
                paddingVertical: 18,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.05)'
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', marginRight: 12 }}>
                    <Image
                      source={{ uri: BOT_AVATAR_IMAGE }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </View>
                  <View>
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>AquaSage AI</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={clearChat} style={{ padding: 10 }}>
                    <Trash2 color="#475569" size={20} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={toggleChat} style={{ padding: 10 }}>
                    <X color="#94a3b8" size={24} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Messages */}
              <ScrollView
                ref={scrollViewRef}
                style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}
                contentContainerStyle={{ paddingBottom: 32 }}
                keyboardShouldPersistTaps="handled"
              >
                {messages.map((msg) => (
                  <View key={msg.id} style={{ flexDirection: 'row', marginBottom: 16, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'assistant' && (
                      <View style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', marginRight: 8, alignSelf: 'flex-end', marginBottom: 2 }}>
                        <Image
                          source={{ uri: BOT_AVATAR_IMAGE }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </View>
                    )}
                    <View style={{
                      maxWidth: '85%',
                      padding: 16,
                      borderRadius: 20,
                      backgroundColor: msg.role === 'user' ? '#00f2fe' : 'rgba(255,255,255,0.05)',
                      borderWidth: msg.role === 'user' ? 0 : 1,
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderBottomLeftRadius: msg.role === 'assistant' ? 0 : 20,
                      borderTopRightRadius: msg.role === 'user' ? 0 : 20,
                    }}>
                      <Text style={{ fontSize: 14, lineHeight: 20, color: msg.role === 'user' ? '#020617' : '#e2e8f0' }}>
                        {msg.content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return (
                              <Text key={i} style={{ fontWeight: 'bold', color: msg.role === 'user' ? '#000000' : '#ffffff' }}>
                                {part.slice(2, -2)}
                              </Text>
                            );
                          }
                          return <Text key={i}>{part}</Text>;
                        })}
                      </Text>
                    </View>
                  </View>
                ))}
                {isLoading && (
                  <View style={{ padding: 16, alignItems: 'flex-start', flexDirection: 'row' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', marginRight: 8, alignSelf: 'flex-end' }}>
                      <Image
                        source={{ uri: BOT_AVATAR_IMAGE }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </View>
                    <ActivityIndicator size="small" color="#00f2fe" />
                  </View>
                )}
              </ScrollView>

              {/* Input Area */}
              <View style={{
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: Platform.OS === 'android' ? 36 : 48,
                backgroundColor: '#01040a',
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.1)'
              }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 24,
                  paddingHorizontal: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.15)'
                }}>
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder="Ask about getVāri..."
                    placeholderTextColor="#475569"
                    style={{ flex: 1, color: '#ffffff', paddingVertical: 12, fontSize: 15 }}
                    multiline
                    blurOnSubmit={false}
                  />
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={!input.trim() || isLoading}
                    style={{ marginLeft: 8 }}
                  >
                    <Send color={input.trim() ? '#00f2fe' : '#475569'} size={24} />
                  </TouchableOpacity>
                </View>
                <Text style={{ color: '#475569', fontSize: 9, textAlign: 'center', marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  AquaSage AI answers strictly from research documents
                </Text>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
};

export default AquaSageChat;
