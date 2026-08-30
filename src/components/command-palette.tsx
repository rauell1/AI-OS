"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50" onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <Command className="w-full" label="Command Menu">
          <Command.Input 
            autoFocus 
            placeholder="What do you need?" 
            className="w-full px-4 py-4 bg-transparent border-b border-zinc-200 dark:border-zinc-800 text-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500" 
          />
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="p-4 text-center text-zinc-500">No results found.</Command.Empty>
            
            <Command.Group heading="Navigation" className="text-sm text-zinc-500 font-medium px-2 py-1">
              <Command.Item className="px-2 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-900 dark:text-zinc-100 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800" onSelect={() => runCommand(() => router.push('/'))}>Home</Command.Item>
              <Command.Item className="px-2 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-900 dark:text-zinc-100 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800" onSelect={() => runCommand(() => router.push('/tasks'))}>Tasks</Command.Item>
              <Command.Item className="px-2 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-900 dark:text-zinc-100 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800" onSelect={() => runCommand(() => router.push('/projects'))}>Projects</Command.Item>
              <Command.Item className="px-2 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-900 dark:text-zinc-100 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800" onSelect={() => runCommand(() => router.push('/opportunities'))}>Opportunities</Command.Item>
            </Command.Group>
            
            <Command.Group heading="Actions" className="text-sm text-zinc-500 font-medium px-2 py-1 mt-2">
              <Command.Item className="px-2 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-900 dark:text-zinc-100 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800" onSelect={() => runCommand(() => router.push('/ai'))}>Ask AI</Command.Item>
              <Command.Item className="px-2 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-900 dark:text-zinc-100 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800" onSelect={() => runCommand(() => router.push('/search'))}>Global Search</Command.Item>
              <Command.Item className="px-2 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-900 dark:text-zinc-100 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800" onSelect={() => runCommand(() => router.push('/settings'))}>Settings</Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
