import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/**
 * 文件管理模块（PRD 7.4）。
 *
 * 提供文件的列表、下载/预览、删除能力。
 * 依赖 UploadsModule 提供磁盘读写能力。
 */
@Module({
  imports: [UploadsModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
