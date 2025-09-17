import { Injectable } from "@nestjs/common";

@Injectable()
export class ProfanityCheckService {
  private profaneWords: Set<string> = new Set([
    "badword3",
  ]);

  public containsProfanity(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/);
    return words.some((word) => this.profaneWords.has(word));
  }
}