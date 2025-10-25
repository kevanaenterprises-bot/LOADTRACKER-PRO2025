import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, FileAudio } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function TTSGenerator() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<"male" | "female">("male");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast({
        title: "Error",
        description: "Please enter some text to generate audio",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Make API request to generate audio
      const response = await fetch("/api/tts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ text, voice }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate audio");
      }

      // Get the audio blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loadtracker-commercial-${voice}-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success!",
        description: "Audio file downloaded successfully",
      });
    } catch (error) {
      console.error("Error generating audio:", error);
      toast({
        title: "Error",
        description: "Failed to generate audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const loadSampleScript = () => {
    const sampleText = `LoadTracker Pro was born out of frustration. Our founder, a trucking company owner himself, was tired of paying seven hundred dollars per month for bloated TMS systems that treated customers like ATM machines.

The old way was broken. Want one feature? Pay for a package with three other things you'll never use. Need another feature? That's in a different package. More money. Got two dispatchers? Can't both work at the same time unless you pay for a second seat. Surprise billing every month based on load counts you couldn't predict. Systems designed for profit, not for the people actually running trucks.

We said enough is enough.

LoadTracker Pro is different. Simple, transparent pricing: two hundred forty-nine dollars per month. Unlimited users. Your entire office can work simultaneously. No per-seat charges. Generous free tier with plenty of loads, GPS tracking, and features included before you hit usage overages.`;
    
    setText(sampleText);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-2">
            <FileAudio className="h-8 w-8 text-blue-600" />
            Text-to-Speech Generator
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Generate professional audio narration using LoadTracker Pro's built-in ElevenLabs TTS
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Commercial Script</CardTitle>
            <CardDescription>
              Paste your script below and generate a professional voice narration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Voice Selection */}
            <div className="space-y-3">
              <Label>Select Voice</Label>
              <RadioGroup value={voice} onValueChange={(v) => setVoice(v as "male" | "female")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="male" id="male" data-testid="radio-voice-male" />
                  <Label htmlFor="male" className="cursor-pointer">
                    Male (Adam - Deep, resonant voice)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="female" id="female" data-testid="radio-voice-female" />
                  <Label htmlFor="female" className="cursor-pointer">
                    Female (Rachel - Clear, warm voice)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Text Input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="script-text">Script Text</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadSampleScript}
                  data-testid="button-load-sample"
                >
                  Load Sample Script
                </Button>
              </div>
              <Textarea
                id="script-text"
                placeholder="Paste your commercial script here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={15}
                className="font-mono text-sm"
                data-testid="textarea-script"
              />
              <p className="text-sm text-gray-500">
                Character count: {text.length}
              </p>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim()}
              className="w-full"
              size="lg"
              data-testid="button-generate-audio"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating Audio...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" />
                  Generate & Download MP3
                </>
              )}
            </Button>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                💡 Tips for Best Results:
              </h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                <li>Spell out numbers as words (e.g., "two hundred forty-nine" instead of "$249")</li>
                <li>Use periods and commas for natural pauses</li>
                <li>The AI voice will sound most natural with conversational text</li>
                <li>Audio generates in MP3 format</li>
                <li>Generation typically takes 10-30 seconds depending on text length</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
