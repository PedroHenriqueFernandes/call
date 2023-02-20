// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { prisma } from '@/lib/prisma'
import { setCookie } from 'nookies'
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { name, username } = req.body

  const userExist = await prisma.user.findUnique({
    where: {
      username,
    },
  })

  if (userExist) {
    return res.status(400).json({
      message: 'User already exists',
    })
  }

  const user = await prisma.user.create({
    data: {
      name,
      username,
    },
  })

  setCookie({ res }, '@call:userId', user.id, {
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  })
  return res.status(201).json(user)
}
