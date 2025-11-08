import { Controller, Get, Param } from "@nestjs/common";

@Controller("file")
export class FileController {
  @Get("test")
  test(): string {
    return "This action returns all cats";
  }

  @Get(":uniqueId")
  get(@Param("uniqueId") uniqueId: string): string {
    return "This action returns all cats";
  }
}
