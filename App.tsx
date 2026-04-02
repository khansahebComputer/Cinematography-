import * as React from 'react';
import { Component, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Video, 
  Settings, 
  Layout, 
  Users, 
  Zap, 
  Play, 
  Download, 
  Trash2, 
  ChevronRight,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Mic,
  Film,
  LogOut,
  LogIn
} from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc, 
  updateDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { AIService } from './services/aiService';
import { VideoEngine } from './services/videoEngine';
import { Project, Scene, Character } from './types';
import { generateId, cn } from './utils';
import confetti from 'canvas-confetti';
import { VISUAL_STYLES } from './constants';

// Error Boundary Component
class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state;
      let errorMessage = "Something went wrong.";
      if (error && error.message) {
        try {
          const parsed = JSON.parse(error.message);
          errorMessage = `Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`;
        } catch (e) {
          errorMessage = error.message;
        }
      }

      return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
            <Trash2 className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-black">Application Error</h1>
          <p className="text-white/40 max-w-md">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-white text-black rounded-xl font-bold hover:bg-white/90 transition-all"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Login() {
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 space-y-12">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-white/10">
          <Film className="w-12 h-12 text-black" />
        </div>
        <h1 className="text-6xl font-black tracking-tighter">CINAMATO</h1>
        <p className="text-white/40 text-xl font-medium">The future of AI-driven cinema.</p>
      </div>

      <button 
        onClick={signInWithGoogle}
        className="group relative flex items-center gap-4 bg-white text-black px-10 py-5 rounded-2xl font-black text-xl hover:scale-105 transition-all shadow-2xl shadow-white/5"
      >
        <LogIn className="w-6 h-6" />
        Sign in with Google
        <div className="absolute -inset-1 bg-white/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, loading] = useAuthState(auth);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [activeProject, setActiveProject] = React.useState<Project | null>(null);
  const [selectedSceneId, setSelectedSceneId] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [view, setView] = React.useState<'dashboard' | 'editor' | 'settings'>('dashboard');
  const [prompt, setPrompt] = React.useState('');
  const [projectStyle, setProjectStyle] = React.useState(VISUAL_STYLES[0].id);
  const [customStyle, setCustomStyle] = React.useState('');
  const [isExporting, setIsExporting] = React.useState(false);

  // Sync Projects from Firestore
  React.useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'projects'), 
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => doc.data() as Project);
      setProjects(projectsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    return () => unsubscribe();
  }, [user]);

  // Sync User Profile
  React.useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const checkUser = async () => {
      try {
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: 'user',
            createdAt: Date.now()
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      }
    };
    checkUser();
  }, [user]);

  // Character Management State
  const [isCharacterModalOpen, setIsCharacterModalOpen] = React.useState(false);
  const [editingCharacter, setEditingCharacter] = React.useState<Character | null>(null);
  const [charName, setCharName] = React.useState('');
  const [charDesc, setCharDesc] = React.useState('');
  const [charPrompt, setCharPrompt] = React.useState('');
  const [charStyle, setCharStyle] = React.useState(VISUAL_STYLES[0].id);
  const [charCustomStyle, setCharCustomStyle] = React.useState('');

  const [charImageUrl, setCharImageUrl] = React.useState<string | undefined>(undefined);
  const [isGeneratingCharImage, setIsGeneratingCharImage] = React.useState(false);

  const generateCharacterImage = async () => {
    if (!charName || !charPrompt) return;
    setIsGeneratingCharImage(true);
    try {
      const style = resolveStyle(charStyle === 'custom' ? charCustomStyle : charStyle);
      const url = await AIService.generateImage(`Character portrait: ${charName}. ${charDesc}. ${charPrompt}`, '1:1', style);
      setCharImageUrl(url);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingCharImage(false);
    }
  };

  const openCharacterModal = (char?: Character) => {
    if (char) {
      setEditingCharacter(char);
      setCharName(char.name);
      setCharDesc(char.description);
      setCharPrompt(char.imagePrompt);
      setCharImageUrl(char.imageUrl);
      
      const isPredefined = VISUAL_STYLES.some(s => s.id === char.visualStyle);
      if (isPredefined) {
        setCharStyle(char.visualStyle || VISUAL_STYLES[0].id);
        setCharCustomStyle('');
      } else if (char.visualStyle) {
        setCharStyle('custom');
        setCharCustomStyle(char.visualStyle);
      } else {
        setCharStyle(activeProject?.visualStyle || VISUAL_STYLES[0].id);
        setCharCustomStyle('');
      }
    } else {
      setEditingCharacter(null);
      setCharName('');
      setCharDesc('');
      setCharPrompt('');
      setCharImageUrl(undefined);
      setCharStyle(activeProject?.visualStyle || VISUAL_STYLES[0].id);
      setCharCustomStyle('');
    }
    setIsCharacterModalOpen(true);
  };

  const saveCharacter = async () => {
    if (!activeProject || !charName) return;

    const newChar: Character = {
      id: editingCharacter?.id || generateId(),
      name: charName,
      description: charDesc,
      imagePrompt: charPrompt,
      imageUrl: charImageUrl || editingCharacter?.imageUrl,
      visualStyle: charStyle === 'custom' ? charCustomStyle : charStyle
    };

    const updatedCharacters = editingCharacter
      ? activeProject.characters.map(c => c.id === editingCharacter.id ? newChar : c)
      : [...activeProject.characters, newChar];

    const updatedProject = { ...activeProject, characters: updatedCharacters, updatedAt: Date.now() };
    setActiveProject(updatedProject);
    
    try {
      await setDoc(doc(db, 'projects', activeProject.id), updatedProject);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
    
    setIsCharacterModalOpen(false);
  };

  const deleteCharacter = async (id: string) => {
    if (!activeProject) return;
    const updatedCharacters = activeProject.characters.filter(c => c.id !== id);
    const updatedProject = { ...activeProject, characters: updatedCharacters, updatedAt: Date.now() };
    setActiveProject(updatedProject);
    
    try {
      await setDoc(doc(db, 'projects', activeProject.id), updatedProject);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
  };

  const updateSceneStyle = async (sceneId: string, styleId: string) => {
    if (!activeProject) return;
    const updatedScenes = activeProject.scenes.map(s => 
      s.id === sceneId ? { ...s, visualStyle: styleId } : s
    );
    const updatedProject = { ...activeProject, scenes: updatedScenes, updatedAt: Date.now() };
    setActiveProject(updatedProject);
    
    try {
      await setDoc(doc(db, 'projects', activeProject.id), updatedProject);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
  };

  const resolveStyle = (styleId?: string) => {
    if (!styleId) return undefined;
    const predefined = VISUAL_STYLES.find(s => s.id === styleId);
    return predefined ? predefined.name : styleId;
  };

  const createProject = async () => {
    if (!prompt || !user) return;
    setIsGenerating(true);
    try {
      const style = projectStyle === 'custom' ? customStyle : VISUAL_STYLES.find(s => s.id === projectStyle)?.name;
      const { title, description, script } = await AIService.generateScript(prompt, style);
      const sceneData = await AIService.splitIntoScenes(script, style);
      
      const newProject: Project = {
        id: generateId(),
        title,
        description,
        script,
        scenes: sceneData.map((s, i) => ({
          ...s,
          id: generateId(),
          index: i,
          status: 'idle',
          visualStyle: projectStyle === 'custom' ? customStyle : projectStyle
        })) as Scene[],
        characters: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        aspectRatio: '16:9',
        userId: user.uid,
        visualStyle: projectStyle === 'custom' ? customStyle : projectStyle
      } as any;

      await setDoc(doc(db, 'projects', newProject.id), newProject);
      
      setActiveProject(newProject);
      setView('editor');
      setPrompt('');
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateSceneMedia = async (sceneId: string) => {
    if (!activeProject) return;
    
    const sceneIndex = activeProject.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) return;

    const updatedScenes = [...activeProject.scenes];
    updatedScenes[sceneIndex].status = 'generating';
    setActiveProject({ ...activeProject, scenes: updatedScenes });

    try {
      // Enhance visual prompt with character consistency
      let enhancedPrompt = updatedScenes[sceneIndex].visualPrompt;
      if (activeProject.characters.length > 0) {
        activeProject.characters.forEach(char => {
          if (updatedScenes[sceneIndex].dialogue.toLowerCase().includes(char.name.toLowerCase())) {
            enhancedPrompt += `. Character description: ${char.name} is ${char.description}. Visual reference: ${char.imagePrompt}`;
          }
        });
      }

      const scene = updatedScenes[sceneIndex];
      const style = resolveStyle(scene.visualStyle) || resolveStyle(activeProject.visualStyle);
      
      const imageUrl = await AIService.generateImage(enhancedPrompt, activeProject.aspectRatio, style);
      const audioUrl = await AIService.generateSpeech(updatedScenes[sceneIndex].dialogue);
      
      const videoUrl = await VideoEngine.generateSceneVideo(
        imageUrl, 
        audioUrl, 
        updatedScenes[sceneIndex].duration,
        activeProject.aspectRatio
      );

      updatedScenes[sceneIndex] = {
        ...updatedScenes[sceneIndex],
        status: 'completed',
        imageUrl,
        audioUrl,
        videoUrl
      };
      
      const updatedProject = { ...activeProject, scenes: updatedScenes, updatedAt: Date.now() };
      setActiveProject(updatedProject);
      try {
        await setDoc(doc(db, 'projects', activeProject.id), updatedProject);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProject.id}`);
      }
    } catch (error) {
      updatedScenes[sceneIndex].status = 'error';
      const updatedProject = { ...activeProject, scenes: updatedScenes, updatedAt: Date.now() };
      setActiveProject(updatedProject);
      try {
        await setDoc(doc(db, 'projects', activeProject.id), updatedProject);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProject.id}`);
      }
    }
  };

  const generateAll = async () => {
    if (!activeProject) return;
    for (const scene of activeProject.scenes) {
      if (scene.status !== 'completed') {
        await generateSceneMedia(scene.id);
      }
    }
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const exportFullVideo = async () => {
    if (!activeProject) return;
    
    const completedVideos = activeProject.scenes
      .filter(s => s.status === 'completed' && s.videoUrl)
      .map(s => s.videoUrl!);

    if (completedVideos.length === 0) {
      alert('No completed scenes to export.');
      return;
    }

    setIsExporting(true);
    try {
      const finalVideoUrl = await VideoEngine.mergeVideos(completedVideos, activeProject.aspectRatio);
      
      const a = document.createElement('a');
      a.href = finalVideoUrl;
      a.download = `${activeProject.title.replace(/\s+/g, '_')}_export.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ffffff', '#8b5cf6', '#3b82f6']
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-white/20" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white/20">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-16 border-b border-white/5 bg-black/50 backdrop-blur-xl z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Film className="w-5 h-5 text-black" />
          </div>
          <span className="font-bold text-xl tracking-tight">CINAMATO</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView('settings')}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5 text-white/60" />
          </button>
          <button 
            onClick={logout}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5 text-white/60" />
          </button>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10">
            <img src={user.photoURL || ''} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Hero Section */}
              <div className="text-center space-y-6 py-12">
                <motion.h1 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-6xl md:text-8xl font-black tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent"
                >
                  CREATE CINEMA<br />WITH AI
                </motion.h1>
                <p className="text-white/40 text-xl max-w-2xl mx-auto font-medium">
                  The ultimate AI video studio. Scripts, scenes, voices, and visuals—all generated in seconds.
                </p>
                
                <div className="max-w-2xl mx-auto relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative flex items-center bg-[#0a0a0a] border border-white/10 rounded-2xl p-2 shadow-2xl">
                    <input 
                      type="text" 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="A futuristic city where robots and humans live together..."
                      className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-lg placeholder:text-white/20"
                    />
                    <button 
                      onClick={createProject}
                      disabled={isGenerating || !prompt}
                      className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-white/90 transition-all disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                      Generate
                    </button>
                  </div>

                  {/* Visual Style Selection */}
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {VISUAL_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setProjectStyle(style.id)}
                        className={cn(
                          "px-4 py-2 rounded-full text-sm font-bold transition-all border",
                          projectStyle === style.id 
                            ? "bg-white text-black border-white" 
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                        )}
                        title={style.description}
                      >
                        {style.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setProjectStyle('custom')}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-bold transition-all border",
                        projectStyle === 'custom' 
                          ? "bg-white text-black border-white" 
                          : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                      )}
                    >
                      Custom Style
                    </button>
                  </div>

                  {projectStyle === 'custom' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 max-w-md mx-auto"
                    >
                      <input 
                        type="text"
                        value={customStyle}
                        onChange={(e) => setCustomStyle(e.target.value)}
                        placeholder="Describe your custom style (e.g. Studio Ghibli, Cyberpunk Neon...)"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20 transition-all"
                      />
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Projects Grid */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Recent Projects</h2>
                  <button className="text-white/40 hover:text-white flex items-center gap-1 text-sm font-medium transition-colors">
                    View all <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {projects.map(project => (
                    <motion.div 
                      key={project.id}
                      whileHover={{ y: -5 }}
                      onClick={() => {
                        setActiveProject(project);
                        setView('editor');
                      }}
                      className="group bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden cursor-pointer hover:border-white/20 transition-all"
                    >
                      <div className="aspect-video bg-white/5 relative flex items-center justify-center">
                        {project.scenes[0]?.imageUrl ? (
                          <img src={project.scenes[0].imageUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <Video className="w-12 h-12 text-white/10" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                        <div className="absolute bottom-4 left-4">
                          <span className="text-xs font-bold uppercase tracking-widest text-white/40">{project.scenes.length} SCENES</span>
                        </div>
                      </div>
                      <div className="p-5 space-y-2">
                        <h3 className="font-bold text-lg group-hover:text-white transition-colors">{project.title}</h3>
                        <p className="text-white/40 text-sm line-clamp-2">{project.description}</p>
                      </div>
                    </motion.div>
                  ))}
                  
                  {projects.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
                      <p className="text-white/20 font-medium">No projects yet. Start by typing a prompt above.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'editor' && activeProject && (
            <motion.div 
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-12 gap-8"
            >
              {/* Left Sidebar: Scenes */}
              <div className="col-span-3 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-xl">Scenes</h2>
                  <button 
                    onClick={generateAll}
                    className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Zap className="w-3 h-3 fill-current" />
                    Generate All
                  </button>
                </div>
                
                <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 custom-scrollbar">
                  {activeProject.scenes.map((scene, idx) => (
                    <div 
                      key={scene.id}
                      onClick={() => setSelectedSceneId(scene.id)}
                      className={cn(
                        "p-4 rounded-xl border transition-all cursor-pointer group",
                        selectedSceneId === scene.id ? "border-white/40 bg-white/5 ring-1 ring-white/10" :
                        scene.status === 'generating' ? "border-purple-500/50 bg-purple-500/5" : 
                        scene.status === 'completed' ? "border-green-500/20 bg-green-500/5" :
                        "border-white/5 bg-white/5 hover:border-white/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <span className="text-[10px] font-black text-white/20 uppercase tracking-tighter">SCENE {idx + 1}</span>
                          <p className="text-sm font-medium line-clamp-2 text-white/80">{scene.dialogue}</p>
                        </div>
                        {scene.status === 'completed' ? (
                          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                            <img src={scene.imageUrl} className="w-full h-full object-cover" />
                          </div>
                        ) : scene.status === 'generating' ? (
                          <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                        ) : (
                          <button 
                            onClick={() => generateSceneMedia(scene.id)}
                            className="p-2 bg-white/5 rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Zap className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Center: Preview & Editor */}
              <div className="col-span-6 space-y-6">
                <div className="aspect-video bg-black rounded-3xl border border-white/10 overflow-hidden relative group shadow-2xl">
                  {activeProject.scenes.some(s => s.status === 'completed') ? (
                    <video 
                      src={activeProject.scenes.find(s => s.status === 'completed')?.videoUrl} 
                      controls 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white/20">
                      <Film className="w-16 h-16" />
                      <p className="font-medium">Generate scenes to preview video</p>
                    </div>
                  )}
                  
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button 
                      onClick={exportFullVideo}
                      disabled={isExporting || !activeProject.scenes.some(s => s.status === 'completed')}
                      className="p-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 hover:bg-black/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isExporting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5" />
                      )}
                      {isExporting && <span className="text-xs font-bold">Exporting...</span>}
                    </button>
                  </div>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold">{activeProject.title}</h3>
                    <div className="flex gap-2">
                      <button className="p-2 hover:bg-white/5 rounded-lg"><Layout className="w-5 h-5 text-white/40" /></button>
                      <button className="p-2 hover:bg-white/5 rounded-lg"><Users className="w-5 h-5 text-white/40" /></button>
                    </div>
                  </div>
                  <textarea 
                    className="w-full bg-transparent border-none focus:ring-0 p-0 text-white/60 leading-relaxed resize-none h-48"
                    value={activeProject.script}
                    readOnly
                  />
                </div>
              </div>

              {/* Right Sidebar: Assets & Controls */}
              <div className="col-span-3 space-y-8">
                {selectedSceneId && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold flex items-center gap-2">
                        <Settings className="w-4 h-4 text-purple-500" />
                        Scene Settings
                      </h4>
                      <button 
                        onClick={() => setSelectedSceneId(null)}
                        className="text-[10px] text-white/20 hover:text-white transition-colors"
                      >
                        CLOSE
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/20 uppercase tracking-widest">Visual Style</label>
                        <div className="grid grid-cols-2 gap-2">
                          {VISUAL_STYLES.map((style) => (
                            <button
                              key={style.id}
                              onClick={() => updateSceneStyle(selectedSceneId, style.id)}
                              className={cn(
                                "px-3 py-2 rounded-lg text-[10px] font-bold transition-all border text-center",
                                activeProject.scenes.find(s => s.id === selectedSceneId)?.visualStyle === style.id 
                                  ? "bg-white text-black border-white" 
                                  : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                              )}
                            >
                              {style.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => generateSceneMedia(selectedSceneId)}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                      >
                        <Zap className="w-4 h-4 fill-current" />
                        RE-GENERATE SCENE
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 space-y-4">
                  <h4 className="font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    Quick Actions
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/5">
                      <Mic className="w-5 h-5 text-blue-400" />
                      <span className="text-[10px] font-bold uppercase">Voices</span>
                    </button>
                    <button className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/5">
                      <ImageIcon className="w-5 h-5 text-green-400" />
                      <span className="text-[10px] font-bold uppercase">Styles</span>
                    </button>
                  </div>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 space-y-4">
                  <h4 className="font-bold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-orange-500" />
                      Characters
                    </div>
                    <span className="text-[10px] text-white/20">{activeProject.characters.length} TOTAL</span>
                  </h4>
                  <div className="space-y-3">
                    {activeProject.characters.map(char => (
                      <div key={char.id} className="group/char flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/20 transition-all">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {char.imageUrl ? (
                              <img src={char.imageUrl} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-orange-500">{char.name[0]}</span>
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate">{char.name}</p>
                            <p className="text-[10px] text-white/40 truncate">{char.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/char:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openCharacterModal(char)}
                            className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                          >
                            <Settings className="w-3 h-3 text-white/60" />
                          </button>
                          <button 
                            onClick={() => deleteCharacter(char.id)}
                            className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-red-500/60" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => openCharacterModal()}
                      className="w-full py-3 border border-dashed border-white/10 rounded-xl text-white/20 text-xs font-bold hover:border-white/30 hover:text-white/40 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      ADD CHARACTER
                    </button>
                  </div>
                </div>

                <button 
                  onClick={generateAll}
                  className="w-full py-4 bg-white text-black rounded-2xl font-black text-lg shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Play className="w-6 h-6 fill-current" />
                  RENDER FINAL
                </button>
              </div>
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-4xl font-black">Settings</h2>
                <p className="text-white/40">Configure your AI models and API keys.</p>
              </div>

              <div className="space-y-6">
                {[
                  { name: 'Gemini API', key: 'GEMINI_API_KEY', status: 'Active' },
                  { name: 'OpenAI API', key: 'OPENAI_API_KEY', status: 'Not Configured' },
                  { name: 'Groq API', key: 'GROQ_API_KEY', status: 'Not Configured' },
                  { name: 'ElevenLabs API', key: 'ELEVENLABS_API_KEY', status: 'Not Configured' }
                ].map(api => (
                  <div key={api.key} className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className="font-bold">{api.name}</h4>
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        api.status === 'Active' ? "text-green-500" : "text-white/20"
                      )}>{api.status}</span>
                    </div>
                    <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors">
                      Configure
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Character Modal */}
        <AnimatePresence>
          {isCharacterModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCharacterModalOpen(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6"
              >
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">{editingCharacter ? 'Edit' : 'Add'} Character</h3>
                  <p className="text-white/40 text-sm">Define your character to ensure visual consistency across scenes.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-6">
                    <div className="w-32 h-32 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 relative group/img">
                      {charImageUrl ? (
                        <img src={charImageUrl} className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-8 h-8 text-white/10" />
                      )}
                      <button 
                        onClick={generateCharacterImage}
                        disabled={isGeneratingCharImage || !charName}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity disabled:hidden"
                      >
                        {isGeneratingCharImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Name</label>
                        <input 
                          type="text" 
                          value={charName}
                          onChange={(e) => setCharName(e.target.value)}
                          placeholder="e.g. Captain Nova"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500/50 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Description</label>
                        <textarea 
                          value={charDesc}
                          onChange={(e) => setCharDesc(e.target.value)}
                          placeholder="e.g. A brave space explorer with a cybernetic eye..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500/50 outline-none transition-all h-20 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Visual Prompt</label>
                    <textarea 
                      value={charPrompt}
                      onChange={(e) => setCharPrompt(e.target.value)}
                      placeholder="e.g. wearing a sleek white and gold space suit, holding a glowing map..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500/50 outline-none transition-all h-24 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Visual Style</label>
                    <div className="flex flex-wrap gap-2">
                      {VISUAL_STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setCharStyle(style.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                            charStyle === style.id 
                              ? "bg-white text-black border-white" 
                              : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                          )}
                        >
                          {style.name}
                        </button>
                      ))}
                      <button
                        onClick={() => setCharStyle('custom')}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                          charStyle === 'custom' 
                            ? "bg-white text-black border-white" 
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                        )}
                      >
                        Custom
                      </button>
                    </div>
                    {charStyle === 'custom' && (
                      <input 
                        type="text"
                        value={charCustomStyle}
                        onChange={(e) => setCharCustomStyle(e.target.value)}
                        placeholder="Custom style description..."
                        className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                      />
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsCharacterModalOpen(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveCharacter}
                    disabled={!charName}
                    className="flex-1 py-3 bg-white text-black rounded-xl font-bold hover:bg-white/90 transition-all disabled:opacity-50"
                  >
                    Save Character
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
