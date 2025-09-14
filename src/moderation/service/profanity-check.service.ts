import { Injectable } from "@nestjs/common";

@Injectable()
export class ProfanityCheckService {
  private profaneWords: Set<string> = new Set([
    "badword1",
    "badword2",
    "badword3",
    // Add more profane words as needed
  ]);

  public containsProfanity(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/);
    return words.some((word) => this.profaneWords.has(word));
  }
}