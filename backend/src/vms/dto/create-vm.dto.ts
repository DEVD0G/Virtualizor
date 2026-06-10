import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsObject, IsOptional, IsString,
  IsUUID, Matches, Max, Min, ValidateNested,
} from 'class-validator';

class DiskDto {
  @IsInt() @Min(1) @Max(16384) sizeGb: number;
  @IsOptional() @IsUUID() storagePoolId?: string;
}

class NicDto {
  @IsUUID() networkId: string;
  @IsOptional() @IsUUID() ipPoolId?: string;
}

export class CreateVmDto {
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/, { message: 'Name: 3-63 Zeichen, a-z 0-9 -' })
  name: string;

  @IsOptional() @IsUUID() nodeId?: string;
  @IsInt() @Min(1) @Max(128) vcpus: number;
  @IsInt() @Min(256) @Max(1048576) memoryMb: number;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8)
  @ValidateNested({ each: true }) @Type(() => DiskDto)
  disks: DiskDto[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8)
  @ValidateNested({ each: true }) @Type(() => NicDto)
  nics: NicDto[];

  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsObject() cloudInit?: { sshKeys?: string[]; userData?: string };
  @IsOptional() @IsUUID() ownerId?: string;
}
