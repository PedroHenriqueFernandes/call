import { prisma } from '@/lib/prisma'
import { NextApiRequest, NextApiResponse } from 'next'
import dayjs from 'dayjs'
import { getGoogleOAuthToken } from '@/lib/google'
import { google } from 'googleapis'

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const username = String(req.query.username)
  const { date } = req.query

  if (!date) {
    return res.status(400).json({ message: 'Date not provided' })
  }

  const user = await prisma.user.findUnique({
    where: { username },
  })

  if (!user) {
    return res.status(404).json({ message: 'User does not exist' })
  }

  const referenceDate = dayjs(String(date))

  const isPastDate = referenceDate.endOf('day').isBefore(new Date())

  if (isPastDate) {
    return res.json({ possibleTimes: [], avalilability: [] })
  }

  const userAvailability = await prisma.userTimeInterval.findFirst({
    where: {
      user_id: user.id,
      week_day: referenceDate.get('day'),
    },
  })

  if (!userAvailability) {
    return res.json({ possibleTimes: [], avalilability: [] })
  }

  const { time_start_in_minutes, time_end_in_minutes } = userAvailability

  const startHour = time_start_in_minutes / 60
  const endHour = time_end_in_minutes / 60

  const possibleTimes = Array.from({
    length: endHour - startHour,
  }).map((_, i) => {
    return startHour + i
  })

  const blockedTimes = await prisma.scheduling.findMany({
    select: {
      date: true,
    },
    where: {
      user_id: user.id,
      date: {
        gte: referenceDate.set('hour', startHour).toDate(),
        lte: referenceDate.set('hour', endHour).toDate(),
      },
    },
  })

  const calendar = google.calendar({
    version: 'v3',
    auth: await getGoogleOAuthToken(user.id),
  })

  const listEventsFromGoogleCalendar: any = await calendar.events.list({
    calendarId: 'primary',
  })

  const datesHaveEventInGoogleCalendar =
    listEventsFromGoogleCalendar.data.items.map((item: any) => {
      if (item.start.dateTime) {
        return item.start.dateTime
      }
      if (item.start.date) {
        return item.start.date
      }
      return null
    })

  const availableTimesWithoutGoogleCalendar = possibleTimes.filter((time) => {
    const isTimeBlocked = blockedTimes.some(
      (blockedTime) => blockedTime.date.getHours() === time,
    )

    const isTimeInPast = referenceDate.set('hour', time).isBefore(new Date())

    return !isTimeBlocked && !isTimeInPast
  })

  const possibleHoursFromGoogleCalendar = datesHaveEventInGoogleCalendar.map(
    (item: any) => {
      const dateCalendarFromGoogleCalendar = dayjs(item).format('YYYY-MM-DD')
      const hourCalendarFromGoogleCalendar = dayjs(item).format('HH')

      const eventAtMomentOfDay =
        date === dateCalendarFromGoogleCalendar &&
        hourCalendarFromGoogleCalendar !== '00'
          ? availableTimesWithoutGoogleCalendar.filter(
              (item: any) => String(item) !== hourCalendarFromGoogleCalendar,
            )
          : null

      const eventInAllDay =
        date === dateCalendarFromGoogleCalendar &&
        hourCalendarFromGoogleCalendar === '00' &&
        []

      const result = eventAtMomentOfDay || eventInAllDay

      return result
    },
  )

  const availableTimesArray =
    possibleHoursFromGoogleCalendar.filter((item: any) => item !== false)
      .length === 0
      ? [availableTimesWithoutGoogleCalendar]
      : possibleHoursFromGoogleCalendar.filter((item: any) => item !== false)

  console.log(possibleHoursFromGoogleCalendar)
  console.log(availableTimesArray)

  const availableTimes =
    availableTimesArray.length > 0 ? availableTimesArray[0] : []

  console.log(availableTimes, possibleTimes)
  return res.json({ possibleTimes, availableTimes })
}
