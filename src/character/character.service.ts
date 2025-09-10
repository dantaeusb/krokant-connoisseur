import {gemini} from "../core/gemini";

// Singleton service to manage character prompt parts.
// Each part has: id (unique), text, priority (lower number = earlier), enabled flag.
// Service can add/update/remove parts and build the final prompt string in priority order.

export interface PromptPart {
    id: string;
    text: string;
    priority: number;
    enabled?: boolean; // default true
}

class CharacterService {
    private static _instance: CharacterService | null = null;
    private parts: Map<string, PromptPart> = new Map();

    private constructor() {}

    static getInstance(): CharacterService {
        if (!this._instance) {
            this._instance = new CharacterService();
        }
        return this._instance;
    }

    upsertPart(part: PromptPart): void {
        const normalized: PromptPart = { enabled: true, ...part };
        this.parts.set(normalized.id, normalized);
    }

    addPart(id: string, text: string, priority: number, enabled: boolean = true): void {
        this.upsertPart({ id, text, priority, enabled });
    }

    removePart(id: string): boolean {
        return this.parts.delete(id);
    }

    clear(): void {
        this.parts.clear();
    }

    setEnabled(id: string, enabled: boolean): void {
        const existing = this.parts.get(id);
        if (existing) {
            existing.enabled = enabled;
            this.parts.set(id, existing);
        }
    }

    updateText(id: string, text: string): void {
        const existing = this.parts.get(id);
        if (existing) {
            existing.text = text;
            this.parts.set(id, existing);
        }
    }

    updatePriority(id: string, priority: number): void {
        const existing = this.parts.get(id);
        if (existing) {
            existing.priority = priority;
            this.parts.set(id, existing);
        }
    }

    getOrderedParts(includeDisabled = false): PromptPart[] {
        return Array.from(this.parts.values())
            .filter(p => includeDisabled || p.enabled !== false)
            .sort((a, b) => a.priority - b.priority);
    }

    buildPrompt(separator: string = '\n\n'): string {
        return this.getOrderedParts()
            .map(p => p.text.trim())
            .filter(Boolean)
            .join(separator)
            .trim();
    }

    /**
     * Execute the assembled prompt against Gemini.
     * @param options optional execution settings
     */
    async execute(options: { model?: string; userInput?: string; separator?: string } = {}): Promise<{ text: string; raw: any }> {
        const { model = 'gemini-2.5-flash', userInput, separator } = options;
        let prompt = this.buildPrompt(separator);
        if (userInput) {
            prompt = `${prompt}\n\nUser: ${userInput.trim()}`;
        }
        try {
            const response: any = await gemini.models.generateContent({
                model,
                contents: prompt,
            });
            const text: string = response?.text || '';
            return { text, raw: response };
        } catch (err) {
            console.error('Gemini execution failed', err);
            return { text: '', raw: err };
        }
    }
}

export const characterService = CharacterService.getInstance();

// Example usage (commented):
// characterService.addPart('system', 'You are a helpful assistant.', 0);
// characterService.addPart('style', 'Respond concisely.', 10);
// const result = await characterService.execute({ userInput: 'How are you?' });
// console.log(result.text);
