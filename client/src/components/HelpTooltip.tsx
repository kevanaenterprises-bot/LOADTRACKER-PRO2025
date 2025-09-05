import { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface HelpTooltipProps {
  content: string;
  title?: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  showOnFirstVisit?: boolean;
  tipId?: string;
}

export function HelpTooltip({ 
  content, 
  title, 
  children, 
  position = "top",
  showOnFirstVisit = false,
  tipId
}: HelpTooltipProps) {
  const [hasBeenSeen, setHasBeenSeen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (showOnFirstVisit && tipId) {
      const seen = localStorage.getItem(`tooltip-seen-${tipId}`);
      if (!seen) {
        setIsOpen(true);
        setTimeout(() => {
          setIsOpen(false);
          localStorage.setItem(`tooltip-seen-${tipId}`, "true");
          setHasBeenSeen(true);
        }, 5000);
      } else {
        setHasBeenSeen(true);
      }
    }
  }, [showOnFirstVisit, tipId]);

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent 
          side={position} 
          className="max-w-xs bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 shadow-lg"
        >
          <div className="flex items-start space-x-3 p-2">
            <div className="text-3xl animate-bounce">
              🚚
            </div>
            <div className="flex-1">
              {title && (
                <div className="font-semibold text-blue-900 mb-1">
                  {title}
                </div>
              )}
              <div className="text-sm text-gray-700">
                {content}
              </div>
              {!hasBeenSeen && showOnFirstVisit && (
                <div className="text-xs text-purple-600 mt-2 font-medium">
                  ✨ First time tip!
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface HelpButtonProps {
  content: string;
  title?: string;
  className?: string;
}

export function HelpButton({ content, title, className = "" }: HelpButtonProps) {
  return (
    <HelpTooltip content={content} title={title}>
      <Button 
        variant="ghost" 
        size="icon"
        className={`h-6 w-6 rounded-full hover:bg-blue-100 ${className}`}
      >
        <span className="text-blue-600 text-sm">?</span>
      </Button>
    </HelpTooltip>
  );
}

interface TruckerTipProps {
  message: string;
  name?: string;
  mood?: "happy" | "helpful" | "excited";
}

export function TruckerTip({ message, name = "Trucker Tom", mood = "helpful" }: TruckerTipProps) {
  const getMoodEmoji = () => {
    switch (mood) {
      case "happy": return "😊";
      case "excited": return "🎉";
      case "helpful": 
      default: return "👍";
    }
  };

  return (
    <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg shadow-md mb-4">
      <div className="flex flex-col items-center">
        <div className="text-4xl">🧑‍🔧</div>
        <div className="text-xs font-semibold text-orange-700 mt-1">{name}</div>
      </div>
      <div className="flex-1">
        <div className="text-sm text-gray-800">
          <span className="text-lg mr-2">{getMoodEmoji()}</span>
          {message}
        </div>
      </div>
    </div>
  );
}