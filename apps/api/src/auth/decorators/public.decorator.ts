import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标记「无需登录即可访问」。
 *
 * 默认是「全部接口都要登录」——这比反过来安全得多：
 * 忘记加 @Public 的后果是「多要一次登录」，而忘记加守卫的后果是「接口裸奔」。
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
