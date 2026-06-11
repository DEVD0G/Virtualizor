import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsObject,
  IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested,
} from 'class-validator';

class DiskDto {
  @IsInt() @Min(1) @Max(16384) sizeGb: number;
  @IsOptional() @IsUUID() storagePoolId?: string;
}

class NicDto {
  @IsUUID() networkId: string;
  @IsOptional() @IsUUID() ipPoolId?: string;
}

class PciDeviceDto {
  @IsOptional() @IsString() domain?: string;
  @IsString() bus: string;
  @IsString() slot: string;
  @IsString() function: string;
  @IsOptional() @IsString() label?: string;
}

export class CreateVmDto {
  @Matches(/^[a-z0-9][-a-z0-9]{2,62}$/, { message: 'Name: 3-63 Zeichen, a-z 0-9 Bindestrich' })
  name: string;

  @IsOptional() @IsUUID() nodeId?: string;
  @IsInt() @Min(1) @Max(128) vcpus: number;
  @IsInt() @Min(256) @Max(1048576) memoryMb: number;

  @IsOptional() @IsBoolean() uefi?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(16) cpuSockets?: number;
  @IsOptional() @IsInt() @Min(1) @Max(64) cpuCores?: number;
  @IsOptional() @IsInt() @Min(1) @Max(8) cpuThreads?: number;
  @IsOptional() @IsArray() @IsIn(['hd', 'cdrom', 'network', 'fd'], { each: true }) bootOrder?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(8)
  @ValidateNested({ each: true }) @Type(() => PciDeviceDto)
  pciDevices?: PciDeviceDto[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8)
  @ValidateNested({ each: true }) @Type(() => DiskDto)
  disks: DiskDto[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8)
  @ValidateNested({ each: true }) @Type(() => NicDto)
  nics: NicDto[];

  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsObject() cloudInit?: { sshKeys?: string[]; userData?: string };
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() description?: string;
}
